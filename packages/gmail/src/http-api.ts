import type { MailboxWatchRenewalResult } from "@mailmon/core";

import { listGmailHistoryDelta } from "./history.js";
import { createGmailHttpClient } from "./http-client.js";
import { createGmailOAuthClient } from "./oauth.js";
import {
  type GmailMessageResponse,
  parseGmailConnectProfileResponse,
  parseGmailListMessagesResponse,
  parseGmailMessageResponse,
  parseGmailProfileResponse,
  parseGmailWatchResponse,
} from "./parsers.js";
import {
  isGmailRateLimitedResponse,
  isProblemDetails,
  makeGmailConnectProblem,
  makeGmailProblem,
  makeGmailRateLimitedProblem,
} from "./problems.js";
import type { GmailSyncProviderConfig } from "./services.js";

const DEFAULT_GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1";
const DEFAULT_GMAIL_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const DEFAULT_GMAIL_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

const toIsoTimestampFromEpochMillis = (epochMillis: string) => {
  const parsedEpochMillis = Number.parseInt(epochMillis, 10);

  if (Number.isNaN(parsedEpochMillis)) {
    throw new Error(`Invalid Gmail watch expiration: ${epochMillis}`);
  }

  return new Date(parsedEpochMillis).toISOString();
};

export const createHttpGmailApi = (config: GmailSyncProviderConfig) => {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const oauthAuthorizeUrl = config.oauthAuthorizeUrl ?? DEFAULT_GMAIL_OAUTH_AUTHORIZE_URL;
  const oauthTokenUrl = config.oauthTokenUrl ?? DEFAULT_GMAIL_OAUTH_TOKEN_URL;
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_GMAIL_API_BASE_URL;
  const httpClient = createGmailHttpClient({ apiBaseUrl, fetchImpl });
  const oauthClient = createGmailOAuthClient({
    fetchImpl,
    oauthClientId: config.oauthClientId,
    oauthClientSecret: config.oauthClientSecret,
    oauthTokenUrl,
  });

  const getProfile = async (params: {
    readonly accessToken: string;
    readonly mailboxId: string;
  }) => {
    const { response, responseBody } = await httpClient.getJson({
      accessToken: params.accessToken,
      pathname: "/users/me/profile",
    });

    if (isGmailRateLimitedResponse(response.status, responseBody)) {
      throw makeGmailRateLimitedProblem({
        mailboxId: params.mailboxId,
        operation: "sync operations",
        status: response.status,
      });
    }

    if (!response.ok) {
      throw makeGmailProblem({
        code: "gmail_profile_fetch_failed",
        detail: `Fetching the Gmail mailbox profile failed with HTTP ${response.status}.`,
        mailboxId: params.mailboxId,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail profile fetch failed",
      });
    }

    return parseGmailProfileResponse(responseBody, params.mailboxId);
  };

  const getConnectProfile = async (params: {
    readonly accessToken: string;
    readonly connectSessionId: string;
  }) => {
    const { response, responseBody } = await httpClient.getJson({
      accessToken: params.accessToken,
      pathname: "/users/me/profile",
    });

    if (!response.ok) {
      throw makeGmailConnectProblem({
        code: "gmail_profile_fetch_failed",
        connectSessionId: params.connectSessionId,
        detail: `Fetching the Gmail mailbox profile failed with HTTP ${response.status}.`,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail profile fetch failed",
      });
    }

    return parseGmailConnectProfileResponse(responseBody, params.connectSessionId);
  };

  const watchMailbox = async (params: {
    readonly accessToken: string;
    readonly mailboxId: string;
  }): Promise<MailboxWatchRenewalResult> => {
    if (
      config.gmailPubSubTopicName === undefined ||
      config.gmailPubSubTopicName === null ||
      config.gmailPubSubTopicName.length === 0
    ) {
      throw makeGmailProblem({
        code: "gmail_watch_topic_missing",
        detail: "MAILMON_GMAIL_PUBSUB_TOPIC_NAME is required to renew Gmail mailbox watches.",
        mailboxId: params.mailboxId,
        retryable: false,
        status: 500,
        title: "Gmail watch topic missing",
      });
    }

    const { response, responseBody } = await httpClient.postJson({
      accessToken: params.accessToken,
      pathname: "/users/me/watch",
      body: {
        topicName: config.gmailPubSubTopicName,
      },
    });

    if (!response.ok) {
      if (isGmailRateLimitedResponse(response.status, responseBody)) {
        throw makeGmailRateLimitedProblem({
          mailboxId: params.mailboxId,
          operation: "mailbox watch renewal",
          status: response.status,
        });
      }

      throw makeGmailProblem({
        code: "gmail_watch_renewal_failed",
        detail: `Renewing the Gmail mailbox watch failed with HTTP ${response.status}.`,
        mailboxId: params.mailboxId,
        retryable: response.status === 429 || response.status >= 500,
        status: response.status,
        title: "Gmail watch renewal failed",
      });
    }

    const parsedResponse = parseGmailWatchResponse(responseBody, params.mailboxId);

    return {
      historyId: parsedResponse.historyId,
      watchExpiresAt: toIsoTimestampFromEpochMillis(parsedResponse.expiration),
    };
  };

  const getMessage = async (params: {
    readonly accessToken: string;
    readonly mailboxId: string;
    readonly messageId: string;
  }) => {
    const { response, responseBody } = await httpClient.getJson({
      accessToken: params.accessToken,
      pathname: `/users/me/messages/${params.messageId}`,
      searchParams: {
        format: "metadata",
        metadataHeaders: ["From", "Subject"],
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      if (isGmailRateLimitedResponse(response.status, responseBody)) {
        throw makeGmailRateLimitedProblem({
          mailboxId: params.mailboxId,
          operation: "sync operations",
          status: response.status,
        });
      }

      throw makeGmailProblem({
        code: "gmail_message_fetch_failed",
        detail: `Fetching Gmail message ${params.messageId} failed with HTTP ${response.status}.`,
        mailboxId: params.mailboxId,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail message fetch failed",
      });
    }

    return parseGmailMessageResponse(responseBody, params.mailboxId, params.messageId);
  };

  const listAllMessages = async (params: {
    readonly accessToken: string;
    readonly mailboxId: string;
  }) => {
    const messageIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const { response, responseBody } = await httpClient.getJson({
        accessToken: params.accessToken,
        pathname: "/users/me/messages",
        searchParams: {
          maxResults: "100",
          pageToken,
        },
      });

      if (!response.ok) {
        if (isGmailRateLimitedResponse(response.status, responseBody)) {
          throw makeGmailRateLimitedProblem({
            mailboxId: params.mailboxId,
            operation: "sync operations",
            status: response.status,
          });
        }

        throw makeGmailProblem({
          code: "gmail_message_list_failed",
          detail: `Listing Gmail messages failed with HTTP ${response.status}.`,
          mailboxId: params.mailboxId,
          retryable: response.status >= 500,
          status: response.status,
          title: "Gmail message list failed",
        });
      }

      const parsedResponse = parseGmailListMessagesResponse(responseBody, params.mailboxId);

      for (const message of parsedResponse.messages ?? []) {
        messageIds.push(message.id);
      }

      pageToken = parsedResponse.nextPageToken;
    } while (pageToken !== undefined);

    const messages = await Promise.all(
      messageIds.map((messageId) =>
        getMessage({
          accessToken: params.accessToken,
          mailboxId: params.mailboxId,
          messageId,
        }),
      ),
    );

    return messages.filter((message): message is GmailMessageResponse => message !== null);
  };

  return {
    exchangeAuthorizationCode: oauthClient.exchangeAuthorizationCode,
    fetchAccessToken: oauthClient.fetchAccessToken,
    getConnectProfile,
    getProfile,
    isProblemDetails,
    listAllMessages,
    listHistoryDelta: (params: {
      readonly accessToken: string;
      readonly cursor: string;
      readonly mailboxId: string;
    }) =>
      listGmailHistoryDelta({
        ...params,
        getMessage: (messageId) =>
          getMessage({
            accessToken: params.accessToken,
            mailboxId: params.mailboxId,
            messageId,
          }),
        httpClient,
      }),
    oauthAuthorizeUrl,
    watchMailbox,
  };
};

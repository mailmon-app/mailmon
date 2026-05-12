import type { MailboxConnectAuthorization } from "@mailmon/core";

import {
  isGmailRateLimitedResponse,
  isReconnectRequiredTokenRefreshPayload,
  makeGmailConnectProblem,
  makeGmailProblem,
  makeGmailRateLimitedProblem,
} from "./problems.js";

export interface GmailOAuthClient {
  readonly exchangeAuthorizationCode: (params: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly connectSessionId: string;
    readonly redirectUri: string;
  }) => Promise<MailboxConnectAuthorization & { accessToken: string }>;
  readonly fetchAccessToken: (params: {
    readonly mailboxId: string;
    readonly refreshToken: string;
  }) => Promise<string>;
}

export const createGmailOAuthClient = (config: {
  readonly fetchImpl: typeof fetch;
  readonly oauthClientId: string | null;
  readonly oauthClientSecret: string | null;
  readonly oauthTokenUrl: string;
}): GmailOAuthClient => {
  const fetchAccessToken: GmailOAuthClient["fetchAccessToken"] = async (params) => {
    if (config.oauthClientId === null || config.oauthClientSecret === null) {
      throw makeGmailProblem({
        code: "gmail_oauth_config_missing",
        detail: "Worker Gmail OAuth client credentials are not configured.",
        mailboxId: params.mailboxId,
        retryable: false,
        status: 500,
        title: "Gmail OAuth config missing",
      });
    }

    const body = new URLSearchParams({
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    });
    const response = await config.fetchImpl(config.oauthTokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);

      if (isReconnectRequiredTokenRefreshPayload(payload)) {
        throw makeGmailProblem({
          code: "gmail_token_refresh_reconnect_required",
          detail:
            payload.error_description ??
            "Refreshing the Gmail access token failed because the stored refresh token is invalid or revoked. The mailbox must be reconnected.",
          mailboxId: params.mailboxId,
          retryable: false,
          status: 401,
          title: "Gmail reconnect required",
        });
      }

      if (isGmailRateLimitedResponse(response.status, payload)) {
        throw makeGmailRateLimitedProblem({
          mailboxId: params.mailboxId,
          operation: "sync operations",
          status: response.status,
        });
      }

      throw makeGmailProblem({
        code: "gmail_token_refresh_failed",
        detail: `Refreshing the Gmail access token failed with HTTP ${response.status}.`,
        mailboxId: params.mailboxId,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail token refresh failed",
      });
    }

    const payload = await response.json();

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("access_token" in payload) ||
      typeof payload.access_token !== "string" ||
      payload.access_token.length === 0
    ) {
      throw makeGmailProblem({
        code: "gmail_token_refresh_failed",
        detail: "Refreshing the Gmail access token returned no access token.",
        mailboxId: params.mailboxId,
        retryable: false,
        status: 502,
        title: "Gmail token refresh failed",
      });
    }

    return payload.access_token;
  };

  const exchangeAuthorizationCode: GmailOAuthClient["exchangeAuthorizationCode"] = async (
    params,
  ) => {
    if (config.oauthClientId === null || config.oauthClientSecret === null) {
      throw makeGmailConnectProblem({
        code: "gmail_oauth_config_missing",
        connectSessionId: params.connectSessionId,
        detail: "API Gmail OAuth client credentials are not configured.",
        retryable: false,
        status: 500,
        title: "Gmail OAuth config missing",
      });
    }

    const body = new URLSearchParams({
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      code: params.code,
      code_verifier: params.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
    });
    const response = await config.fetchImpl(config.oauthTokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw makeGmailConnectProblem({
        code: "gmail_authorization_code_exchange_failed",
        connectSessionId: params.connectSessionId,
        detail: `Exchanging the Gmail authorization code failed with HTTP ${response.status}.`,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail authorization code exchange failed",
      });
    }

    const payload = await response.json();

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("access_token" in payload) ||
      typeof payload.access_token !== "string" ||
      payload.access_token.length === 0 ||
      !("refresh_token" in payload) ||
      typeof payload.refresh_token !== "string" ||
      payload.refresh_token.length === 0
    ) {
      throw makeGmailConnectProblem({
        code: "gmail_authorization_code_exchange_failed",
        connectSessionId: params.connectSessionId,
        detail: "Exchanging the Gmail authorization code returned no refresh token.",
        retryable: false,
        status: 502,
        title: "Gmail authorization code exchange failed",
      });
    }

    return {
      accessToken: payload.access_token,
      providerAccountEmail: "",
      refreshToken: payload.refresh_token,
    };
  };

  return {
    exchangeAuthorizationCode,
    fetchAccessToken,
  };
};

import { createHash } from "node:crypto";

import { MailboxConnectProvider, type MailboxConnectAuthorization } from "@mailmon/core";
import { Effect, Layer } from "effect";

import { createHttpGmailApi } from "./http-api.js";
import { isProblemDetails, makeGmailConnectProblem } from "./problems.js";
import type { GmailSyncProviderConfig } from "./services.js";

const createPkceCodeChallenge = (codeVerifier: string) => {
  return createHash("sha256").update(codeVerifier).digest("base64url");
};

export const createHttpGmailConnectProviderLayer = (config: GmailSyncProviderConfig) =>
  Layer.effect(
    MailboxConnectProvider,
    Effect.sync(() => {
      const gmailApi = createHttpGmailApi(config);

      return {
        createAuthorizationUrl: (params) =>
          Effect.try({
            catch: (error) => {
              if (isProblemDetails(error)) {
                return error;
              }

              return makeGmailConnectProblem({
                code: "gmail_authorization_url_failed",
                connectSessionId: params.connectSessionId,
                detail:
                  error instanceof Error
                    ? error.message
                    : "An unexpected Gmail authorization URL error occurred.",
                retryable: false,
                status: 500,
                title: "Gmail authorization URL failed",
              });
            },
            try: () => {
              if (config.oauthClientId === null) {
                throw makeGmailConnectProblem({
                  code: "gmail_oauth_config_missing",
                  connectSessionId: params.connectSessionId,
                  detail: "API Gmail OAuth client credentials are not configured.",
                  retryable: false,
                  status: 500,
                  title: "Gmail OAuth config missing",
                });
              }

              const authorizationUrl = new URL(gmailApi.oauthAuthorizeUrl);

              authorizationUrl.searchParams.set("access_type", "offline");
              authorizationUrl.searchParams.set("client_id", config.oauthClientId);
              authorizationUrl.searchParams.set(
                "code_challenge",
                createPkceCodeChallenge(params.codeVerifier),
              );
              authorizationUrl.searchParams.set("code_challenge_method", "S256");
              authorizationUrl.searchParams.set("include_granted_scopes", "true");
              authorizationUrl.searchParams.set("prompt", "consent");
              authorizationUrl.searchParams.set("redirect_uri", params.redirectUri);
              authorizationUrl.searchParams.set("response_type", "code");
              authorizationUrl.searchParams.set(
                "scope",
                "https://www.googleapis.com/auth/gmail.readonly",
              );
              authorizationUrl.searchParams.set("state", params.connectSessionId);

              return authorizationUrl.toString();
            },
          }),
        completeAuthorization: (params) =>
          Effect.tryPromise({
            catch: (error) => {
              if (isProblemDetails(error)) {
                return error;
              }

              return makeGmailConnectProblem({
                code: "gmail_connect_failed",
                connectSessionId: params.connectSessionId,
                detail:
                  error instanceof Error
                    ? error.message
                    : "An unexpected Gmail connect error occurred.",
                retryable: true,
                status: 502,
                title: "Gmail connect failed",
              });
            },
            try: async () => {
              const authorization = await gmailApi.exchangeAuthorizationCode({
                code: params.code,
                codeVerifier: params.codeVerifier,
                connectSessionId: params.connectSessionId,
                redirectUri: params.redirectUri,
              });
              const profile = await gmailApi.getConnectProfile({
                accessToken: authorization.accessToken,
                connectSessionId: params.connectSessionId,
              });

              return {
                providerAccountEmail: profile.emailAddress.trim().toLowerCase(),
                refreshToken: authorization.refreshToken,
              } satisfies MailboxConnectAuthorization;
            },
          }),
      };
    }),
  );

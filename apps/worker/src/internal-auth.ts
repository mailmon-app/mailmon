import type { AsyncTransportMode } from "@mailmon/config";
import { Effect } from "effect";
import { OAuth2Client } from "google-auth-library";

export interface VerifiedGoogleOidcToken {
  readonly audience: string | ReadonlyArray<string>;
  readonly email: string | null;
  readonly emailVerified: boolean | null;
  readonly issuer: string | null;
}

export interface GoogleOidcVerifier {
  readonly verify: (idToken: string, audience: string) => Promise<VerifiedGoogleOidcToken | null>;
}

export interface WorkerInternalAuthOptions {
  readonly allowedServiceAccountEmails: ReadonlyArray<string>;
  readonly audience: string;
  readonly verifier?: GoogleOidcVerifier;
}

export type InternalAuthResult =
  | {
      readonly authorized: true;
    }
  | {
      readonly authorized: false;
      readonly body: {
        readonly code: string;
        readonly detail: string;
      };
      readonly statusCode: number;
    };

const googleOidcClient = new OAuth2Client();
const GOOGLE_OIDC_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

const createGoogleOidcVerifier = (): GoogleOidcVerifier => {
  return {
    verify: async (idToken, audience) => {
      const ticket = await googleOidcClient.verifyIdToken({
        audience,
        idToken,
      });
      const payload = ticket.getPayload();

      if (payload === undefined) {
        return null;
      }

      return {
        audience: payload.aud,
        email: payload.email ?? null,
        emailVerified: payload.email_verified ?? null,
        issuer: payload.iss ?? null,
      };
    },
  };
};

const extractBearerToken = (authorizationHeader: string | undefined) => {
  if (authorizationHeader === undefined) {
    return null;
  }

  const [scheme, token, extra] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || token === undefined || token.length === 0 || extra !== undefined) {
    return null;
  }

  return token;
};

const tokenAudienceMatches = (
  actualAudience: string | ReadonlyArray<string>,
  expectedAudience: string,
) => {
  return Array.isArray(actualAudience)
    ? actualAudience.includes(expectedAudience)
    : actualAudience === expectedAudience;
};

const normalizeEmail = (email: string) => email.toLowerCase();

const authorizeSuccess: InternalAuthResult = {
  authorized: true,
};

const authorizeFailure = (
  code: string,
  detail: string,
  statusCode: number,
): InternalAuthResult => ({
  authorized: false,
  body: {
    code,
    detail,
  },
  statusCode,
});
const authorizeInternalRequestEffect = Effect.fn("worker.authorizeInternalRequest")(function* (
  authorizationHeader: string | undefined,
  options: Readonly<{
    readonly asyncTransportMode: AsyncTransportMode;
    readonly internalAuth?: WorkerInternalAuthOptions;
  }>,
) {
  if (options.asyncTransportMode === "local") {
    return authorizeSuccess;
  }

  if (options.internalAuth === undefined) {
    return authorizeFailure(
      "worker_internal_auth_not_configured",
      "Internal worker authentication is not configured.",
      500,
    );
  }

  const token = extractBearerToken(authorizationHeader);

  if (token === null) {
    return authorizeFailure(
      "worker_internal_auth_required",
      "Internal worker requests must include Authorization: Bearer <google_oidc_token>.",
      401,
    );
  }

  const internalAuth = options.internalAuth;
  const verifier = internalAuth.verifier ?? createGoogleOidcVerifier();
  const verifiedToken = yield* Effect.tryPromise({
    catch: () => "invalid_oidc_token" as const,
    try: () => verifier.verify(token, internalAuth.audience),
  }).pipe(Effect.catch(() => Effect.succeed(null)));

  if (verifiedToken === null) {
    return authorizeFailure(
      "worker_internal_auth_invalid",
      "The internal worker authorization token is invalid.",
      401,
    );
  }

  if (
    verifiedToken.issuer === null ||
    !GOOGLE_OIDC_ISSUERS.has(verifiedToken.issuer) ||
    !tokenAudienceMatches(verifiedToken.audience, internalAuth.audience)
  ) {
    return authorizeFailure(
      "worker_internal_auth_forbidden",
      "The internal worker authorization token is not trusted for this worker.",
      403,
    );
  }

  if (verifiedToken.email === null || verifiedToken.emailVerified !== true) {
    return authorizeFailure(
      "worker_internal_auth_forbidden",
      "The internal worker authorization token is missing a verified service account.",
      403,
    );
  }

  const allowedEmails = new Set(
    internalAuth.allowedServiceAccountEmails.map((email) => normalizeEmail(email)),
  );

  if (!allowedEmails.has(normalizeEmail(verifiedToken.email))) {
    return authorizeFailure(
      "worker_internal_auth_forbidden",
      "The internal worker authorization token was issued for an unauthorized service account.",
      403,
    );
  }

  return authorizeSuccess;
});

export const authorizeInternalRequest = (
  authorizationHeader: string | undefined,
  options: Readonly<{
    readonly asyncTransportMode: AsyncTransportMode;
    readonly internalAuth?: WorkerInternalAuthOptions;
  }>,
): Promise<InternalAuthResult> =>
  Effect.runPromise(authorizeInternalRequestEffect(authorizationHeader, options));

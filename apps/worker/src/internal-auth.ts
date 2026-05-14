import type { AsyncTransportMode } from "@mailmon/config";
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

export const authorizeInternalRequest = async (
  authorizationHeader: string | undefined,
  options: Readonly<{
    readonly asyncTransportMode: AsyncTransportMode;
    readonly internalAuth?: WorkerInternalAuthOptions;
  }>,
): Promise<InternalAuthResult> => {
  if (options.asyncTransportMode === "local") {
    return {
      authorized: true,
    };
  }

  if (options.internalAuth === undefined) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_not_configured",
        detail: "Internal worker authentication is not configured.",
      },
      statusCode: 500,
    };
  }

  const token = extractBearerToken(authorizationHeader);

  if (token === null) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_required",
        detail: "Internal worker requests must include Authorization: Bearer <google_oidc_token>.",
      },
      statusCode: 401,
    };
  }

  const verifier = options.internalAuth.verifier ?? createGoogleOidcVerifier();
  let verifiedToken: VerifiedGoogleOidcToken | null;

  try {
    verifiedToken = await verifier.verify(token, options.internalAuth.audience);
  } catch {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_invalid",
        detail: "The internal worker authorization token is invalid.",
      },
      statusCode: 401,
    };
  }

  if (verifiedToken === null) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_invalid",
        detail: "The internal worker authorization token is invalid.",
      },
      statusCode: 401,
    };
  }

  if (
    verifiedToken.issuer === null ||
    !GOOGLE_OIDC_ISSUERS.has(verifiedToken.issuer) ||
    !tokenAudienceMatches(verifiedToken.audience, options.internalAuth.audience)
  ) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_forbidden",
        detail: "The internal worker authorization token is not trusted for this worker.",
      },
      statusCode: 403,
    };
  }

  if (verifiedToken.email === null || verifiedToken.emailVerified !== true) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_forbidden",
        detail: "The internal worker authorization token is missing a verified service account.",
      },
      statusCode: 403,
    };
  }

  const allowedEmails = new Set(
    options.internalAuth.allowedServiceAccountEmails.map((email) => normalizeEmail(email)),
  );

  if (!allowedEmails.has(normalizeEmail(verifiedToken.email))) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_forbidden",
        detail:
          "The internal worker authorization token was issued for an unauthorized service account.",
      },
      statusCode: 403,
    };
  }

  return {
    authorized: true,
  };
};

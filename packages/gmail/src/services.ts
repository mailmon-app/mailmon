import type { ProblemDetails } from "@mailmon/core";
import { Context, Effect } from "effect";

export interface GmailMailboxCredential {
  readonly mailboxId: string;
  readonly refreshToken: string;
}

type GmailRefreshTokenCipherOperation = "decrypt" | "encrypt";

export interface GmailRefreshTokenCipherError {
  readonly _tag: "GmailRefreshTokenCipherError";
  readonly message: string;
  readonly operation: GmailRefreshTokenCipherOperation;
}

export interface GmailRefreshTokenCipherKey {
  readonly encryptionKey: string;
  readonly keyId: string;
}

export interface GmailRefreshTokenInspection {
  readonly keyId: string | null;
  readonly rewrapRequired: boolean;
  readonly storage: "encrypted" | "plaintext";
}

export class GmailRefreshTokenCipher extends Context.Service<
  GmailRefreshTokenCipher,
  {
    readonly decryptRefreshToken: (
      storedRefreshToken: string,
    ) => Effect.Effect<string, GmailRefreshTokenCipherError>;
    readonly encryptRefreshToken: (
      refreshToken: string,
    ) => Effect.Effect<string, GmailRefreshTokenCipherError>;
    readonly inspectRefreshToken: (
      storedRefreshToken: string,
    ) => Effect.Effect<GmailRefreshTokenInspection, GmailRefreshTokenCipherError>;
    readonly rewrapRefreshToken: (
      storedRefreshToken: string,
    ) => Effect.Effect<string, GmailRefreshTokenCipherError>;
  }
>()("@mailmon/gmail/GmailRefreshTokenCipher") {}

export class GmailMailboxCredentialStore extends Context.Service<
  GmailMailboxCredentialStore,
  {
    readonly getGmailMailboxCredential: (
      mailboxId: string,
    ) => Effect.Effect<GmailMailboxCredential | null, ProblemDetails>;
  }
>()("@mailmon/gmail/GmailMailboxCredentialStore") {}

export interface GmailRefreshTokenCipherConfig {
  readonly activeKeyId?: string;
  readonly allowPlaintextFallback?: boolean;
  readonly decryptionKeys?: ReadonlyArray<GmailRefreshTokenCipherKey>;
  readonly encryptionKey: string;
}

export interface GmailSyncProviderConfig {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly gmailPubSubTopicName?: string | null;
  readonly oauthAuthorizeUrl?: string;
  readonly oauthClientId: string | null;
  readonly oauthClientSecret: string | null;
  readonly oauthTokenUrl?: string;
}

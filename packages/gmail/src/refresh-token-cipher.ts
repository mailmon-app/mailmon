import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Effect, Layer } from "effect";

import {
  GmailRefreshTokenCipher,
  type GmailRefreshTokenCipherConfig,
  type GmailRefreshTokenCipherError,
  type GmailRefreshTokenInspection,
} from "./services.js";

interface GmailRefreshTokenEnvelopeV1 {
  readonly alg: "aes-256-gcm";
  readonly ciphertext: string;
  readonly iv: string;
  readonly kid?: string;
  readonly tag: string;
  readonly v: 1;
}

const GMAIL_REFRESH_TOKEN_ENVELOPE_PREFIX = "mmrt_v1:";
const GMAIL_REFRESH_TOKEN_ENVELOPE_VERSION = 1;
const GMAIL_REFRESH_TOKEN_IV_BYTES = 12;
const DEFAULT_GMAIL_REFRESH_TOKEN_KEY_ID = "primary";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const hasString = (value: Record<string, unknown>, key: string) => {
  return typeof value[key] === "string";
};

const createGmailRefreshTokenCipherError = (
  operation: GmailRefreshTokenCipherError["operation"],
  message: string,
): GmailRefreshTokenCipherError => {
  return {
    _tag: "GmailRefreshTokenCipherError",
    message,
    operation,
  };
};

const isGmailRefreshTokenEnvelopeV1 = (value: unknown): value is GmailRefreshTokenEnvelopeV1 => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.v === GMAIL_REFRESH_TOKEN_ENVELOPE_VERSION &&
    value.alg === "aes-256-gcm" &&
    hasString(value, "ciphertext") &&
    hasString(value, "iv") &&
    hasString(value, "tag")
  );
};

const parseGmailRefreshTokenEncryptionKey = (encryptionKey: string) => {
  const decodedKey = Buffer.from(encryptionKey, "base64");

  if (decodedKey.byteLength !== 32) {
    throw new Error(
      "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }

  return decodedKey;
};

const normalizeGmailRefreshTokenKeyId = (keyId: string) => {
  const normalized = keyId.trim();

  if (normalized.length === 0) {
    throw new Error("Gmail refresh token encryption key IDs must be non-empty.");
  }

  return normalized;
};

const createGmailRefreshTokenKeyRing = (config: GmailRefreshTokenCipherConfig) => {
  const activeKeyId = normalizeGmailRefreshTokenKeyId(
    config.activeKeyId ?? DEFAULT_GMAIL_REFRESH_TOKEN_KEY_ID,
  );
  const activeKey = {
    id: activeKeyId,
    key: parseGmailRefreshTokenEncryptionKey(config.encryptionKey),
  };
  const keyEntries = new Map<string, Buffer>([[activeKey.id, activeKey.key]]);

  for (const configuredKey of config.decryptionKeys ?? []) {
    const keyId = normalizeGmailRefreshTokenKeyId(configuredKey.keyId);

    if (keyEntries.has(keyId)) {
      throw new Error(`Duplicate Gmail refresh token encryption key ID: ${keyId}`);
    }

    keyEntries.set(keyId, parseGmailRefreshTokenEncryptionKey(configuredKey.encryptionKey));
  }

  return {
    activeKey,
    keys: [...keyEntries.entries()].map(([id, key]) => ({ id, key })),
    keysById: keyEntries,
  };
};

const serializeGmailRefreshTokenEnvelope = (envelope: GmailRefreshTokenEnvelopeV1) => {
  return `${GMAIL_REFRESH_TOKEN_ENVELOPE_PREFIX}${Buffer.from(
    JSON.stringify(envelope),
    "utf8",
  ).toString("base64url")}`;
};

const parseGmailRefreshTokenEnvelope = (
  storedRefreshToken: string,
  allowPlaintextFallback: boolean,
) => {
  if (!storedRefreshToken.startsWith(GMAIL_REFRESH_TOKEN_ENVELOPE_PREFIX)) {
    if (allowPlaintextFallback) {
      return {
        kind: "plaintext" as const,
        refreshToken: storedRefreshToken,
      };
    }

    throw new Error("Stored Gmail refresh token is not in the encrypted envelope format.");
  }

  const encodedEnvelope = storedRefreshToken.slice(GMAIL_REFRESH_TOKEN_ENVELOPE_PREFIX.length);
  const parsedEnvelope = JSON.parse(
    Buffer.from(encodedEnvelope, "base64url").toString("utf8"),
  ) as unknown;

  if (!isGmailRefreshTokenEnvelopeV1(parsedEnvelope)) {
    throw new Error("Stored Gmail refresh token envelope is invalid.");
  }

  return {
    envelope: parsedEnvelope,
    kind: "encrypted" as const,
  };
};

const decryptGmailRefreshTokenEnvelope = (envelope: GmailRefreshTokenEnvelopeV1, key: Buffer) => {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));

  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};

export const createAesGcmGmailRefreshTokenCipherLayer = (config: GmailRefreshTokenCipherConfig) =>
  Layer.effect(
    GmailRefreshTokenCipher,
    Effect.sync(() => {
      const keyRing = createGmailRefreshTokenKeyRing(config);
      const allowPlaintextFallback = config.allowPlaintextFallback ?? false;
      const decryptEncryptedRefreshToken = (envelope: GmailRefreshTokenEnvelopeV1) => {
        if (envelope.kid !== undefined) {
          const keyedDecryptionKey = keyRing.keysById.get(envelope.kid);

          if (keyedDecryptionKey === undefined) {
            throw new Error(
              `Stored Gmail refresh token references unknown encryption key ID: ${envelope.kid}`,
            );
          }

          return decryptGmailRefreshTokenEnvelope(envelope, keyedDecryptionKey);
        }

        let lastError: unknown;

        for (const candidateKey of keyRing.keys) {
          try {
            return decryptGmailRefreshTokenEnvelope(envelope, candidateKey.key);
          } catch (error) {
            lastError = error;
          }
        }

        throw lastError instanceof Error
          ? lastError
          : new Error("Stored Gmail refresh token could not be decrypted.");
      };
      const inspectParsedRefreshToken = (
        parsedRefreshToken: ReturnType<typeof parseGmailRefreshTokenEnvelope>,
      ): GmailRefreshTokenInspection => {
        if (parsedRefreshToken.kind === "plaintext") {
          return {
            keyId: null,
            rewrapRequired: true,
            storage: "plaintext",
          };
        }

        decryptEncryptedRefreshToken(parsedRefreshToken.envelope);

        return {
          keyId: parsedRefreshToken.envelope.kid ?? null,
          rewrapRequired: parsedRefreshToken.envelope.kid !== keyRing.activeKey.id,
          storage: "encrypted",
        };
      };
      const encryptRefreshTokenEnvelope = (refreshToken: string) => {
        const iv = randomBytes(GMAIL_REFRESH_TOKEN_IV_BYTES);
        const cipher = createCipheriv("aes-256-gcm", keyRing.activeKey.key, iv);
        const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);

        return serializeGmailRefreshTokenEnvelope({
          alg: "aes-256-gcm",
          ciphertext: ciphertext.toString("base64url"),
          iv: iv.toString("base64url"),
          kid: keyRing.activeKey.id,
          tag: cipher.getAuthTag().toString("base64url"),
          v: GMAIL_REFRESH_TOKEN_ENVELOPE_VERSION,
        });
      };

      return {
        decryptRefreshToken: (storedRefreshToken: string) =>
          Effect.try({
            catch: (error) =>
              createGmailRefreshTokenCipherError(
                "decrypt",
                error instanceof Error
                  ? error.message
                  : "Stored Gmail refresh token could not be decrypted.",
              ),
            try: () => {
              const parsedRefreshToken = parseGmailRefreshTokenEnvelope(
                storedRefreshToken,
                allowPlaintextFallback,
              );

              if (parsedRefreshToken.kind === "plaintext") {
                return parsedRefreshToken.refreshToken;
              }

              return decryptEncryptedRefreshToken(parsedRefreshToken.envelope);
            },
          }),
        encryptRefreshToken: (refreshToken: string) =>
          Effect.try({
            catch: (error) =>
              createGmailRefreshTokenCipherError(
                "encrypt",
                error instanceof Error
                  ? error.message
                  : "Gmail refresh token could not be encrypted.",
              ),
            try: () => encryptRefreshTokenEnvelope(refreshToken),
          }),
        inspectRefreshToken: (storedRefreshToken: string) =>
          Effect.try({
            catch: (error) =>
              createGmailRefreshTokenCipherError(
                "decrypt",
                error instanceof Error
                  ? error.message
                  : "Stored Gmail refresh token could not be inspected.",
              ),
            try: () => {
              const parsedRefreshToken = parseGmailRefreshTokenEnvelope(storedRefreshToken, true);

              return inspectParsedRefreshToken(parsedRefreshToken);
            },
          }),
        rewrapRefreshToken: (storedRefreshToken: string) =>
          Effect.try({
            catch: (error) =>
              createGmailRefreshTokenCipherError(
                "encrypt",
                error instanceof Error
                  ? error.message
                  : "Stored Gmail refresh token could not be rewrapped.",
              ),
            try: () => {
              const parsedRefreshToken = parseGmailRefreshTokenEnvelope(storedRefreshToken, true);
              const inspection = inspectParsedRefreshToken(parsedRefreshToken);

              if (!inspection.rewrapRequired) {
                return storedRefreshToken;
              }

              const refreshToken =
                parsedRefreshToken.kind === "plaintext"
                  ? parsedRefreshToken.refreshToken
                  : decryptEncryptedRefreshToken(parsedRefreshToken.envelope);

              return encryptRefreshTokenEnvelope(refreshToken);
            },
          }),
      };
    }),
  );

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../../config.js";
import type { SecretCipher } from "../../../domain/shared/interfaces/providers/secret-cipher.js";

const ALGORITHM = "aes-256-gcm";
/** Format: `v1.<iv>.<tag>.<ciphertext>`, each segment base64url-encoded. */
const FORMAT_VERSION = "v1";
const SEPARATOR = ".";
const SEGMENT_COUNT = 4;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DECRYPTION_ERROR_MESSAGE = "Unable to decrypt secret";

/** AES-256-GCM cipher for secrets at rest. A fresh random IV is used for every encryption. */
export class AesGcmSecretCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor() {
    this.key = Buffer.from(env.OUTBOX_ENCRYPTION_KEY, "base64");
  }

  /** Encrypts UTF-8 text and returns the versioned, self-describing envelope. */
  encrypt(plainText: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      FORMAT_VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(SEPARATOR);
  }

  /**
   * Decrypts an envelope produced by `encrypt`.
   * Throws if the format, version, or authentication tag is invalid.
   */
  decrypt(cipherText: string): string {
    const segments = parseEnvelope(cipherText);
    const [ivPart, tagPart, dataPart] = segments;

    try {
      const iv = Buffer.from(ivPart, "base64url");
      const tag = Buffer.from(tagPart, "base64url");
      const data = Buffer.from(dataPart, "base64url");
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new Error("Invalid IV or authentication tag length");
      }

      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      throw new Error(DECRYPTION_ERROR_MESSAGE);
    }
  }
}

/** Splits the envelope and checks its version and segment count. */
function parseEnvelope(cipherText: string): [string, string, string] {
  const segments = cipherText.split(SEPARATOR);
  const [version, ivPart, tagPart, dataPart] = segments;
  if (
    segments.length !== SEGMENT_COUNT ||
    version !== FORMAT_VERSION ||
    ivPart === undefined ||
    tagPart === undefined ||
    dataPart === undefined
  ) {
    throw new Error(DECRYPTION_ERROR_MESSAGE);
  }
  return [ivPart, tagPart, dataPart];
}

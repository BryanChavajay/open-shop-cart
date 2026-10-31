import { createHash, randomBytes } from "node:crypto";
import type { OpaqueTokenGenerator } from "../../../domain/shared/interfaces/providers/opaque-token-generator.js";

const TOKEN_BYTES = 32;

/** Opaque token generator backed by Node's CSPRNG and SHA-256. */
export class CryptoOpaqueTokenGenerator implements OpaqueTokenGenerator {
  /** Returns 32 random bytes encoded as base64url (URL-safe). */
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString("base64url");
  }

  /** Returns the SHA-256 hex digest of the token. Deterministic. */
  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}

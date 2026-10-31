import { argon2id, hash, verify } from "argon2";
import type { PasswordHasher } from "../../../domain/shared/interfaces/providers/password-hasher.js";

/** Password hasher based on Argon2id with the library's default cost parameters. */
export class Argon2PasswordHasher implements PasswordHasher {
  /** Returns the encoded Argon2id digest of the given plain text. */
  hash(plainText: string): Promise<string> {
    return hash(plainText, { type: argon2id });
  }

  /**
   * Checks a plain text against an encoded digest.
   * Never throws: malformed digests or internal failures yield `false`.
   */
  async verify(digest: string, plainText: string): Promise<boolean> {
    try {
      return await verify(digest, plainText);
    } catch {
      return false;
    }
  }
}

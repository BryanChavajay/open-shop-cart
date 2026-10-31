import { v4, v7 } from "uuid";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";

/** Identifier generator backed by the `uuid` package (v7 for public ids, v4 otherwise). */
export class UuidIdentifierGenerator implements IdentifierGenerator {
  /** Time-ordered UUID v7 used as the public user identifier. */
  newPublicId(): string {
    return v7();
  }

  /** Random UUID v4 used as the session version. */
  newSessionVersion(): string {
    return v4();
  }

  /** Random UUID v4 used as the JWT `jti` claim. */
  newTokenId(): string {
    return v4();
  }

}

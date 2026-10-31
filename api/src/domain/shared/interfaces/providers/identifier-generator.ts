/** Generación de identificadores. */
export interface IdentifierGenerator {
  /** UUID v7 para el identificador público del usuario. */
  newPublicId(): string;
  /** UUID v4 para la versión de sesión. */
  newSessionVersion(): string;
  /** Identificador único de cada token (jti). */
  newTokenId(): string;
}

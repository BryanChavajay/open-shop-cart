import type { TokenUse } from "../../enums/token-use.enum.js";

/** Datos que viajan en el JWT. El rol no se incluye: se consulta en cada petición. */
export interface TokenPayload {
  /** Identificador público del usuario (claim sub). */
  publicId: string;
  /** Versión de sesión del usuario (claim ssv). */
  sessionVersion: string;
  /** Identificador único del token (claim jti). */
  tokenId: string;
}

export interface VerifiedToken extends TokenPayload {
  tokenUse: TokenUse;
  expiresAt: Date;
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

/** Emisión y validación de JWT. Las implementaciones lanzan UnauthorizedError si el token no es válido. */
export interface TokenService {
  signAccessToken(payload: TokenPayload): Promise<SignedAccessToken>;
  signRefreshToken(payload: TokenPayload, expiresAt: Date): Promise<string>;
  verifyAccessToken(token: string): Promise<VerifiedToken>;
  verifyRefreshToken(token: string): Promise<VerifiedToken>;
}

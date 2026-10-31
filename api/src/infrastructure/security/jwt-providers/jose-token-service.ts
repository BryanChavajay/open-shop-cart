import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { env } from "../../../config.js";
import { ErrorCode } from "../../../domain/shared/enums/error-code.enum.js";
import { TokenUse } from "../../../domain/auth/enums/token-use.enum.js";
import { UnauthorizedError } from "../../../domain/shared/errors/unauthorized.js";
import type {
  SignedAccessToken,
  TokenPayload,
  TokenService,
  VerifiedToken,
} from "../../../domain/auth/interfaces/providers/token-service.js";

/** Fixed signing algorithm. Never taken from configuration or from the token header. */
const ALGORITHM = "HS256";
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const INVALID_SESSION_MESSAGE = "Invalid or expired session";

/** JWT service backed by `jose`. Access and refresh tokens are signed with different keys. */
export class JoseTokenService implements TokenService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;
  private readonly accessTtlSeconds: number;

  constructor() {
    this.accessKey = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET_KEY);
    this.refreshKey = new TextEncoder().encode(env.REFRESH_TOKEN_SECRET_KEY);
    this.accessTtlSeconds = Math.round(env.ACCESS_TOKEN_EXPIRE_MINUTES * SECONDS_PER_MINUTE);
  }

  /** Signs a short-lived access token expiring after ACCESS_TOKEN_EXPIRE_MINUTES. */
  async signAccessToken(payload: TokenPayload): Promise<SignedAccessToken> {
    const issuedAt = nowInSeconds();
    const expiresAt = issuedAt + this.accessTtlSeconds;
    const token = await this.sign(payload, TokenUse.ACCESS, issuedAt, expiresAt, this.accessKey);
    return { token, expiresAt: fromSeconds(expiresAt) };
  }

  /** Signs a refresh token expiring at the given date. */
  signRefreshToken(payload: TokenPayload, expiresAt: Date): Promise<string> {
    const issuedAt = nowInSeconds();
    return this.sign(
      payload,
      TokenUse.REFRESH,
      issuedAt,
      toSeconds(expiresAt),
      this.refreshKey,
    );
  }

  /** Validates an access token. Throws UnauthorizedError on any failure. */
  verifyAccessToken(token: string): Promise<VerifiedToken> {
    return this.verify(token, this.accessKey, TokenUse.ACCESS);
  }

  /** Validates a refresh token. Throws UnauthorizedError on any failure. */
  verifyRefreshToken(token: string): Promise<VerifiedToken> {
    return this.verify(token, this.refreshKey, TokenUse.REFRESH);
  }

  private sign(
    payload: TokenPayload,
    tokenUse: TokenUse,
    issuedAt: number,
    expiresAt: number,
    key: Uint8Array,
  ): Promise<string> {
    return new SignJWT({ ssv: payload.sessionVersion, token_use: tokenUse })
      .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
      .setSubject(payload.publicId)
      .setJti(payload.tokenId)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(key);
  }

  private async verify(
    token: string,
    key: Uint8Array,
    expectedUse: TokenUse,
  ): Promise<VerifiedToken> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, key, {
        algorithms: [ALGORITHM],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        requiredClaims: ["exp", "iat", "sub", "jti", "ssv", "token_use"],
      });
      payload = result.payload;
    } catch {
      throw invalidSessionError();
    }
    return toVerifiedToken(payload, expectedUse);
  }
}

/** Maps verified claims to the domain shape, rejecting a mismatched `token_use`. */
function toVerifiedToken(payload: JWTPayload, expectedUse: TokenUse): VerifiedToken {
  const { sub, jti, ssv, exp, iat, token_use: tokenUse } = payload;
  if (
    typeof sub !== "string" || !sub.trim() ||
    typeof jti !== "string" || !jti.trim() ||
    typeof ssv !== "string" || !ssv.trim() ||
    typeof exp !== "number" || !Number.isSafeInteger(exp) ||
    typeof iat !== "number" || !Number.isSafeInteger(iat) || iat > nowInSeconds() || exp <= iat ||
    tokenUse !== expectedUse
  ) {
    throw invalidSessionError();
  }
  return {
    publicId: sub,
    sessionVersion: ssv,
    tokenId: jti,
    tokenUse: expectedUse,
    expiresAt: fromSeconds(exp),
  };
}

function invalidSessionError(): UnauthorizedError {
  return new UnauthorizedError(
    INVALID_SESSION_MESSAGE,
    ErrorCode.SESSION_INVALID,
    undefined,
    undefined,
  );
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
}

function toSeconds(date: Date): number {
  return Math.floor(date.getTime() / MILLISECONDS_PER_SECOND);
}

function fromSeconds(seconds: number): Date {
  return new Date(seconds * MILLISECONDS_PER_SECOND);
}

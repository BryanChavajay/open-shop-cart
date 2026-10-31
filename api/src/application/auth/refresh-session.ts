import type { RefreshTokenRepository } from "../../domain/auth/interfaces/repositories/refresh-token.repository.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { TokenService } from "../../domain/auth/interfaces/providers/token-service.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { UnauthorizedError } from "../../domain/shared/errors/unauthorized.js";
import { DuplicateKeyError } from "../../domain/shared/errors/duplicate-key.js";
import type { AuthSession } from "./dependencies.js";
import { asCurrentUser } from "./dependencies.js";

export interface RefreshSessionCommand {
  refreshToken: string;
}
export class RefreshSession {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly tokenService: TokenService,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
    private readonly refreshTokenLifetimeMs: number,
  ) {}
  async execute(command: RefreshSessionCommand): Promise<AuthSession> {
    const token = await this.tokenService.verifyRefreshToken(
      command.refreshToken,
    );

    if (await this.refreshTokens.exists(token.tokenId))
      throw new UnauthorizedError(
        "El token de renovación ya fue utilizado",
        ErrorCode.REFRESH_TOKEN_REUSED,
        undefined,
        undefined,
      );

    const user = await this.users.findByPublicId(token.publicId);

    if (
      !user ||
      !user.canAuthenticate() ||
      user.sessionVersion !== token.sessionVersion
    )
      throw new UnauthorizedError(
        "La sesión no es válida",
        ErrorCode.SESSION_INVALID,
        undefined,
        undefined,
      );

    const current = asCurrentUser(user);

    const refreshExpiresAt = new Date(
      this.clock.now().getTime() + this.refreshTokenLifetimeMs,
    );

    const payload = {
      publicId: user.publicId,
      sessionVersion: user.sessionVersion,
      tokenId: this.identifiers.newTokenId(),
    };

    const refreshToken = await this.tokenService.signRefreshToken(
      payload,
      refreshExpiresAt,
    );

    const access = await this.tokenService.signAccessToken({
      ...payload,
      tokenId: this.identifiers.newTokenId(),
    });

    try {
      await this.refreshTokens.save(token.tokenId);
    } catch (error) {
      if (!(error instanceof DuplicateKeyError)) throw error;
      throw new UnauthorizedError(
        "El token de renovación ya fue utilizado",
        ErrorCode.REFRESH_TOKEN_REUSED,
        undefined,
        undefined,
      );
    }

    return {
      tokens: {
        accessToken: access.token,
        accessExpiresAt: access.expiresAt,
        refreshToken,
        refreshExpiresAt,
      },
      user: current,
    };
  }
}

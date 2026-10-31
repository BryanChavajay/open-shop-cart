import type { RefreshTokenRepository } from "../../domain/auth/interfaces/repositories/refresh-token.repository.js";
import type { TokenService } from "../../domain/auth/interfaces/providers/token-service.js";
import { DuplicateKeyError } from "../../domain/shared/errors/duplicate-key.js";

export interface LogoutCommand {
  refreshToken: string;
}
export class Logout {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly tokenService: TokenService,
  ) {}
  async execute(command: LogoutCommand): Promise<void> {
    const token = await this.tokenService.verifyRefreshToken(
      command.refreshToken,
    );

    if (await this.refreshTokens.exists(token.tokenId)) return;

    try {
      await this.refreshTokens.save(token.tokenId);
    } catch (error) {
      if (!(error instanceof DuplicateKeyError)) throw error;
    }
  }
}

import { User } from "../../domain/users/entities/user.entity.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { UnauthorizedError } from "../../domain/shared/errors/unauthorized.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { PasswordHasher } from "../../domain/shared/interfaces/providers/password-hasher.js";
import type { TokenService } from "../../domain/auth/interfaces/providers/token-service.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { AuthSession } from "./dependencies.js";
import { asCurrentUser } from "./dependencies.js";

export interface LoginCommand {
  email: string;
  password: string;
}
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$THw4MzQiEhJPtSUFB0SzBA$EUabbS1XEab1REV99HiiSUzZMuZQ1Yol5QJZYxavINw";

export class Login {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
    private readonly refreshTokenLifetimeMs: number,
  ) {}
  async execute(command: LoginCommand): Promise<AuthSession> {
    const user = await this.users.findByEmail(
      User.normalizeEmail(command.email),
    );

    const valid = await this.passwordHasher.verify(
      user?.passwordHash ?? DUMMY_HASH,
      command.password,
    );

    if (!user || !valid || !user.canAuthenticate())
      throw new UnauthorizedError(
        "Correo o contraseña incorrectos",
        ErrorCode.INVALID_CREDENTIALS,
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

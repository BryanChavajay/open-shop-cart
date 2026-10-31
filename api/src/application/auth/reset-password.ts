import { User } from "../../domain/users/entities/user.entity.js";
import { AuthorizationPurpose } from "../../domain/auth/enums/authorization-purpose.enum.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { AuthorizationTokenRepository } from "../../domain/auth/interfaces/repositories/authorization-token.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { OpaqueTokenGenerator } from "../../domain/shared/interfaces/providers/opaque-token-generator.js";
import type { PasswordHasher } from "../../domain/shared/interfaces/providers/password-hasher.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { UserCache } from "../../domain/users/interfaces/cache/user-cache.js";
import { UnauthorizedError } from "../../domain/shared/errors/unauthorized.js";
import { ForbiddenError } from "../../domain/shared/errors/forbidden-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface ResetPasswordCommand {
  token: string;
  password: string;
}
export class ResetPassword {
  constructor(
    private readonly users: UserRepository,
    private readonly authorizationTokens: AuthorizationTokenRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly opaqueTokenGenerator: OpaqueTokenGenerator,
    private readonly passwordHasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly cache: UserCache,
    private readonly emailServiceEnabled: boolean,
  ) {}
  async execute(command: ResetPasswordCommand): Promise<void> {
    if (!this.emailServiceEnabled)
      throw new ForbiddenError(
        "La recuperación de contraseña está deshabilitada",
        ErrorCode.PASSWORD_RECOVERY_DISABLED,
        undefined,
        undefined,
      );

    User.validatePassword(command.password);

    const record = await this.authorizationTokens.findByHash(
      AuthorizationPurpose.PASSWORD_RECOVERY,
      this.opaqueTokenGenerator.hash(command.token),
    );

    if (
      !record ||
      record.usedAt !== null ||
      record.expiresAt <= this.clock.now()
    )
      throw new UnauthorizedError(
        "Autorización inválida o vencida",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
        undefined,
        undefined,
      );

    const user = await this.users.findByPublicId(record.userPublicId);

    if (!user || user.id !== record.userId || user.isDeleted)
      throw new UnauthorizedError(
        "La cuenta no permite recuperar la contraseña",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
        undefined,
        undefined,
      );

    user.replacePasswordHash(
      await this.passwordHasher.hash(command.password),
      this.identifiers.newSessionVersion(),
    );

    if (record.expiresAt <= this.clock.now())
      throw new UnauthorizedError(
        "Autorización vencida",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
        undefined,
        undefined,
      );

    await this.authorizationTokens.updateUsedAt(record.id, this.clock.now());

    await this.users.update(user);

    try {
      await this.cache.delete(user.publicId);
    } catch (error) {
      console.error("[ResetPassword] Cache deletion failed", error);
    }
  }
}

import { AuthorizationPurpose } from "../../domain/auth/enums/authorization-purpose.enum.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { AuthorizationTokenRepository } from "../../domain/auth/interfaces/repositories/authorization-token.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { OpaqueTokenGenerator } from "../../domain/shared/interfaces/providers/opaque-token-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { UserCache } from "../../domain/users/interfaces/cache/user-cache.js";
import { UnauthorizedError } from "../../domain/shared/errors/unauthorized.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface ConfirmAccountCommand {
  token: string;
}
export class ConfirmAccount {
  constructor(
    private readonly users: UserRepository,
    private readonly authorizationTokens: AuthorizationTokenRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly opaqueTokenGenerator: OpaqueTokenGenerator,
    private readonly clock: Clock,
    private readonly cache: UserCache,
  ) {}
  async execute(command: ConfirmAccountCommand): Promise<void> {
    const record = await this.authorizationTokens.findByHash(
      AuthorizationPurpose.ACCOUNT_CONFIRMATION,
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

    if (!user || user.id !== record.userId || !user.isPendingConfirmation())
      throw new UnauthorizedError(
        "La cuenta no está pendiente de confirmación",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
        undefined,
        undefined,
      );

    user.confirmAccount(this.identifiers.newSessionVersion());

    await this.authorizationTokens.updateUsedAt(record.id, this.clock.now());

    await this.users.update(user);

    try {
      await this.cache.delete(user.publicId);
    } catch (error) {
      console.error("[ConfirmAccount] Cache deletion failed", error);
    }
  }
}

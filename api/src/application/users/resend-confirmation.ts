import { AuthorizationPurpose } from "../../domain/auth/enums/authorization-purpose.enum.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { AuthorizationTokenRepository } from "../../domain/auth/interfaces/repositories/authorization-token.repository.js";
import type { EmailOutboxRepository } from "../../domain/auth/interfaces/repositories/email-outbox.repository.js";
import type { OpaqueTokenGenerator } from "../../domain/shared/interfaces/providers/opaque-token-generator.js";
import type { SecretCipher } from "../../domain/shared/interfaces/providers/secret-cipher.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface ResendConfirmationCommand {
  publicId: string;
}
export class ResendConfirmation {
  constructor(
    private readonly users: UserRepository,
    private readonly authorizationTokens: AuthorizationTokenRepository,
    private readonly outbox: EmailOutboxRepository,
    private readonly opaqueTokenGenerator: OpaqueTokenGenerator,
    private readonly secretCipher: SecretCipher,
    private readonly clock: Clock,
  ) {}
  async execute(command: ResendConfirmationCommand): Promise<void> {
    const user = await this.users.findByPublicId(command.publicId);

    if (!user || user.id === null || user.isDeleted)
      throw new NotFoundError(
        "Usuario no encontrado",
        ErrorCode.USER_NOT_FOUND,
        undefined,
        undefined,
      );

    if (!user.isPendingConfirmation())
      throw new BusinessRuleViolation(
        "La cuenta no está pendiente de confirmación",
        ErrorCode.INVALID_USER_STATE,
        undefined,
        undefined,
      );

    const now = this.clock.now();

    const purpose = AuthorizationPurpose.ACCOUNT_CONFIRMATION;

    for (const previous of await this.authorizationTokens.listByUser(
      user.id,
      purpose,
    )) {
      if (previous.usedAt === null)
        await this.authorizationTokens.updateUsedAt(previous.id, now);
    }

    const rawToken = this.opaqueTokenGenerator.generate();

    await this.authorizationTokens.insert({
      userId: user.id,
      purpose,
      tokenHash: this.opaqueTokenGenerator.hash(rawToken),
      pendingEmail: null,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
      usedAt: null,
    });

    await this.outbox.insert({
      purpose,
      recipient: user.email,
      encryptedPayload: this.secretCipher.encrypt(
        JSON.stringify({ token: rawToken }),
      ),
      status: "PENDIENTE",
      attempts: 0,
      nextAttemptAt: now,
      lastError: null,
      sentAt: null,
    });
  }
}

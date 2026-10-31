import { User } from "../../domain/users/entities/user.entity.js";
import { AuthorizationPurpose } from "../../domain/auth/enums/authorization-purpose.enum.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { AuthorizationTokenRepository } from "../../domain/auth/interfaces/repositories/authorization-token.repository.js";
import type { EmailOutboxRepository } from "../../domain/auth/interfaces/repositories/email-outbox.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { PasswordHasher } from "../../domain/shared/interfaces/providers/password-hasher.js";
import type { OpaqueTokenGenerator } from "../../domain/shared/interfaces/providers/opaque-token-generator.js";
import type { SecretCipher } from "../../domain/shared/interfaces/providers/secret-cipher.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface RegisterClientCommand {
  firstName: string;
  lastName: string | null;
  email: string;
  password: string;
}
export class RegisterClient {
  constructor(
    private readonly users: UserRepository,
    private readonly authorizationTokens: AuthorizationTokenRepository,
    private readonly outbox: EmailOutboxRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly passwordHasher: PasswordHasher,
    private readonly opaqueTokenGenerator: OpaqueTokenGenerator,
    private readonly secretCipher: SecretCipher,
    private readonly clock: Clock,
    private readonly emailServiceEnabled: boolean,
  ) {}
  async execute(command: RegisterClientCommand): Promise<void> {
    User.validatePassword(command.password);

    if (await this.users.findByEmail(User.normalizeEmail(command.email)))
      throw new ConflictError(
        "El correo ya está registrado",
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        undefined,
        undefined,
      );

    const user = await this.users.save(
      User.registerClient(
        {
          ...command,
          publicId: this.identifiers.newPublicId(),
          passwordHash: await this.passwordHasher.hash(command.password),
          sessionVersion: this.identifiers.newSessionVersion(),
        },
        this.emailServiceEnabled,
      ),
    );

    if (user.id === null) throw new Error("User write returned no identifier");

    if (!this.emailServiceEnabled) return;

    const now = this.clock.now();

    const rawToken = this.opaqueTokenGenerator.generate();

    const purpose = AuthorizationPurpose.ACCOUNT_CONFIRMATION;

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

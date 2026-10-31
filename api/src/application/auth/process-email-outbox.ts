import { AuthorizationPurpose } from "../../domain/auth/enums/authorization-purpose.enum.js";
import type { EmailOutboxRepository } from "../../domain/auth/interfaces/repositories/email-outbox.repository.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { EmailSender } from "../../domain/shared/interfaces/providers/email-sender.js";
import type { SecretCipher } from "../../domain/shared/interfaces/providers/secret-cipher.js";

export interface ProcessEmailOutboxCommand {
  limit: number;
}

export class ProcessOutbox {
  constructor(
    private readonly outbox: EmailOutboxRepository,
    private readonly sender: EmailSender,
    private readonly cipher: SecretCipher,
    private readonly clock: Clock,
    private readonly authorizationUrls: Readonly<
      Record<
        Exclude<AuthorizationPurpose, AuthorizationPurpose.EMAIL_CHANGE>,
        string
      >
    >,
    private readonly retryDelayMs: number,
    private readonly emailServiceEnabled: boolean,
  ) {
    if (!Number.isFinite(retryDelayMs) || retryDelayMs <= 0)
      throw new Error("El intervalo de reintento debe ser positivo");
  }

  async execute({
    limit,
  }: ProcessEmailOutboxCommand): Promise<{ sent: number; failed: number }> {
    if (!Number.isSafeInteger(limit) || limit <= 0)
      throw new Error("El límite debe ser un entero positivo");

    const emails = await this.outbox.list({
      status: "PENDIENTE",
      before: this.clock.now(),
      limit,
    });

    let sent = 0;

    let failed = 0;

    for (const email of emails) {
      // Retire obsolete profile links and do not deliver recovery links while disabled.
      // Account confirmations already pending remain usable in either mode.
      if (
        email.purpose === AuthorizationPurpose.EMAIL_CHANGE ||
        (!this.emailServiceEnabled &&
          email.purpose === AuthorizationPurpose.PASSWORD_RECOVERY)
      ) {
        email.status = "CANCELADO";
        email.encryptedPayload = null;
        email.lastError = null;
        await this.outbox.update(email);
        continue;
      }
      email.attempts++;
      email.nextAttemptAt = new Date(
        this.clock.now().getTime() + this.retryDelayMs,
      );
      await this.outbox.update(email);
      try {
        if (!email.encryptedPayload) throw new Error("Missing email payload");
        const payload: unknown = JSON.parse(
          this.cipher.decrypt(email.encryptedPayload),
        );
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("token" in payload) ||
          typeof payload.token !== "string"
        )
          throw new Error("Invalid email payload");
        const url = new URL(this.authorizationUrls[email.purpose]);
        url.searchParams.set("token", payload.token);
        const subject =
          email.purpose === AuthorizationPurpose.ACCOUNT_CONFIRMATION
            ? "Confirma tu cuenta"
            : "Recupera tu contraseña";
        await this.sender.send({
          to: email.recipient,
          subject,
          text: `${subject}: ${url.toString()}`,
          html: undefined,
        });
      } catch {
        email.lastError = "No se pudo procesar el correo";
        email.nextAttemptAt = new Date(
          this.clock.now().getTime() + this.retryDelayMs,
        );
        await this.outbox.update(email);
        failed++;
        continue;
      }
      email.status = "ENVIADO";
      email.sentAt = this.clock.now();
      email.encryptedPayload = null;
      email.lastError = null;
      await this.outbox.update(email);
      sent++;
    }
    return { sent, failed };
  }
}

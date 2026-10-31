import { createTransport } from "nodemailer";
import { env } from "../../config.js";
import type { EmailMessage, EmailSender } from "../../domain/shared/interfaces/providers/email-sender.js";

const GMAIL_SMTP_HOST = "smtp.gmail.com";
const GMAIL_SMTP_PORT = 465;

/** Transactional email sender using Gmail SMTP over implicit TLS with an application password. */
export class NodemailerEmailSender implements EmailSender {
  /** Created once per instance; Nodemailer pools connections internally. */
  private readonly transporter = createTransport({
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_PORT,
    secure: true,
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  });

  /** Sends a message. Transport errors propagate to the caller. */
  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: { name: env.MAIL_FROM_NAME, address: env.GMAIL_USER },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

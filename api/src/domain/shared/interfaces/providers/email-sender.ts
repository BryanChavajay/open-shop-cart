export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string | undefined;
}

/** Envío de correos transaccionales. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

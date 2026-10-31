import type { AuthorizationPurpose } from "../../enums/authorization-purpose.enum.js";

export interface OutboxEmailData {
  purpose: AuthorizationPurpose;
  recipient: string;
  encryptedPayload: string | null;
  status: "PENDIENTE" | "ENVIADO" | "CANCELADO";
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  sentAt: Date | null;
}

export interface OutboxEmailRecord extends OutboxEmailData {
  id: number;
}

export interface EmailOutboxRepository {
  insert(data: OutboxEmailData): Promise<void>;
  list(filter: {
    status: OutboxEmailData["status"];
    before: Date;
    limit: number;
  }): Promise<OutboxEmailRecord[]>;
  update(record: OutboxEmailRecord): Promise<void>;
}

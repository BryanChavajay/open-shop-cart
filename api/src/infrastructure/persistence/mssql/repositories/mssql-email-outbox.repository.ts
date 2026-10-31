import sql from "mssql";
import { AuthorizationPurpose } from "../../../../domain/auth/enums/authorization-purpose.enum.js";
import type { EmailOutboxRepository, OutboxEmailData, OutboxEmailRecord } from "../../../../domain/auth/interfaces/repositories/email-outbox.repository.js";
import { parseEnum, readNumber, readString, readNullableString, readDate, readNullableDate } from "../mssql-helpers.js";
import type { SqlExecutor, SqlParam } from "../sql-executor.js";

function parameters(data: OutboxEmailData): SqlParam[] {
  return [
    { name: "Proposito", type: sql.NVarChar(50), value: data.purpose },
    { name: "Destinatario", type: sql.NVarChar(254), value: data.recipient },
    { name: "PayloadCifrado", type: sql.NVarChar(sql.MAX), value: data.encryptedPayload },
    { name: "Estado", type: sql.NVarChar(20), value: data.status },
    { name: "Intentos", type: sql.Int, value: data.attempts },
    { name: "ProximoIntentoEn", type: sql.DateTime2(3), value: data.nextAttemptAt },
    { name: "UltimoError", type: sql.NVarChar(2000), value: data.lastError },
    { name: "EnviadoEn", type: sql.DateTime2(3), value: data.sentAt },
  ];
}
export class MssqlEmailOutboxRepository implements EmailOutboxRepository {
  constructor(private readonly executor: SqlExecutor) {}
  async insert(data: OutboxEmailData): Promise<void> {
    await this.executor.execute("SP_BandejaCorreos_Guardar", parameters(data));
  }
  async list(filter: { status: OutboxEmailData["status"]; before: Date; limit: number }): Promise<OutboxEmailRecord[]> {
    const result = await this.executor.execute("SP_BandejaCorreos_Listar", [
      { name: "Estado", type: sql.NVarChar(20), value: filter.status },
      { name: "AntesDe", type: sql.DateTime2(3), value: filter.before },
      { name: "Limite", type: sql.Int, value: filter.limit },
    ]);
    return result.recordset.map(row => ({ id: readNumber(row, "IDCorreo"),
      purpose: parseEnum(AuthorizationPurpose, readString(row, "Proposito"), "Proposito"),
      recipient: readString(row, "Destinatario"), encryptedPayload: readNullableString(row, "PayloadCifrado"),
      status: parseEnum({ pending: "PENDIENTE", sent: "ENVIADO", cancelled: "CANCELADO" } as const, readString(row, "Estado"), "Estado"),
      attempts: readNumber(row, "Intentos"), nextAttemptAt: readDate(row, "ProximoIntentoEn"),
      lastError: readNullableString(row, "UltimoError"), sentAt: readNullableDate(row, "EnviadoEn") }));
  }
  async update(record: OutboxEmailRecord): Promise<void> {
    await this.executor.execute("SP_BandejaCorreos_Actualizar", [
      { name: "IDCorreo", type: sql.Int, value: record.id }, ...parameters(record),
    ]);
  }
}

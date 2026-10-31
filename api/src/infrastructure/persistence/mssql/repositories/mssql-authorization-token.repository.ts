import sql from "mssql";
import { AuthorizationPurpose } from "../../../../domain/auth/enums/authorization-purpose.enum.js";
import type {
  AuthorizationTokenRepository,
  AuthorizationTokenData,
  AuthorizationTokenRecord,
} from "../../../../domain/auth/interfaces/repositories/authorization-token.repository.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";
import {
  parseEnum,
  readDate,
  readNullableDate,
  readNullableString,
  readNumber,
  readString,
  readUuid,
} from "../mssql-helpers.js";

function toRecord(row: SqlRow): AuthorizationTokenRecord {
  return {
    id: readNumber(row, "IDAutorizacion"),
    userId: readNumber(row, "IDUsuario"),
    userPublicId: readUuid(row, "IDPublico"),
    purpose: parseEnum(
      AuthorizationPurpose,
      readString(row, "Proposito"),
      "Proposito",
    ),
    tokenHash: readString(row, "HashToken"),
    pendingEmail: readNullableString(row, "CorreoPendiente"),
    expiresAt: readDate(row, "ExpiraEn"),
    usedAt: readNullableDate(row, "UtilizadaEn"),
  };
}
export class MssqlAuthorizationTokenRepository implements AuthorizationTokenRepository {
  constructor(private readonly executor: SqlExecutor) {}

  async insert(data: AuthorizationTokenData): Promise<void> {
    await this.executor.execute("SP_Autorizaciones_Guardar", [
      { name: "IDUsuario", type: sql.Int, value: data.userId },
      { name: "Proposito", type: sql.NVarChar(50), value: data.purpose },
      { name: "HashToken", type: sql.NVarChar(128), value: data.tokenHash },
      {
        name: "CorreoPendiente",
        type: sql.NVarChar(254),
        value: data.pendingEmail,
      },
      { name: "ExpiraEn", type: sql.DateTime2(3), value: data.expiresAt },
      { name: "UtilizadaEn", type: sql.DateTime2(3), value: data.usedAt },
    ]);
  }

  async findByHash(
    purpose: AuthorizationPurpose,
    tokenHash: string,
  ): Promise<AuthorizationTokenRecord | null> {
    const result = await this.executor.execute("SP_Autorizaciones_Buscar", [
      { name: "Proposito", type: sql.NVarChar(50), value: purpose },
      { name: "HashToken", type: sql.NVarChar(128), value: tokenHash },
    ]);
    const row = result.recordset[0];
    return row ? toRecord(row) : null;
  }

  async listByUser(
    userId: number,
    purpose: AuthorizationPurpose,
  ): Promise<AuthorizationTokenRecord[]> {
    const result = await this.executor.execute("SP_Autorizaciones_Listar", [
      { name: "IDUsuario", type: sql.Int, value: userId },
      { name: "Proposito", type: sql.NVarChar(50), value: purpose },
    ]);
    return result.recordset.map(toRecord);
  }

  async updateUsedAt(id: number, usedAt: Date): Promise<void> {
    await this.executor.execute("SP_Autorizaciones_ActualizarUso", [
      { name: "IDAutorizacion", type: sql.Int, value: id },
      { name: "UtilizadaEn", type: sql.DateTime2(3), value: usedAt },
    ]);
  }
}

import sql from "mssql";
import type { AuditEntry } from "../../../../domain/audit/entities/audit-entry.entity.js";
import type { AuditDetailReadModel } from "../../../../domain/audit/readmodels/audit-detail.read-model.js";
import type { AuditListItemReadModel } from "../../../../domain/audit/readmodels/audit-list-item.read-model.js";
import type { PaginatedReadModel } from "../../../../domain/shared/readmodels/paginated.read-model.js";
import type {
  AuditRepository,
  ListAuditEntriesFilter,
} from "../../../../domain/audit/interfaces/repositories/audit.repository.js";
import type { CommandExecutor } from "../../../../domain/shared/interfaces/providers/sql-executor.js";
import {
  firstRow,
  readDate,
  readNullableString,
  readNumber,
  readString,
  readUuid,
} from "../mssql-helpers.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";

const PROCEDURES = {
  append: "SP_Bitacora_Agregar",
  list: "SP_Bitacora_Listar",
  findDetail: "SP_Bitacora_ObtenerDetalle",
} as const;

/** Reads the audit identifier; BIGINT columns may arrive as number or string. */
function readId(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  throw new TypeError(`Se esperaba identificador en la columna ${column}`);
}

function toAuditListItem(row: SqlRow): AuditListItemReadModel {
  return {
    id: readId(row, "IDBitacora"),
    moduleCode: readNumber(row, "IDModulo"),
    entityType: readString(row, "TipoEntidad"),
    entityIdentifier: readString(row, "IdentificadorEntidad"),
    action: readString(row, "Accion"),
    userPublicId: readUuid(row, "UsuarioIDPublico"),
    userFirstName: readString(row, "Nombres"),
    userLastName: readNullableString(row, "Apellidos"),
    registeredAt: readDate(row, "FechaRegistro"),
  };
}

/** Parses an audit JSON column; null for empty cells. */
function fromJson(row: SqlRow, column: string): Record<string, unknown> | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("Invalid JSON in audit column " + column);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid JSON in audit column " + column);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid JSON in audit column " + column);
  }
  const values: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(parsed)) {
    values[key] = item;
  }
  return values;
}

/** Serializes audit values to JSON; null stays null. */
function toJson(values: Record<string, unknown> | null): string | null {
  return values === null ? null : JSON.stringify(values);
}

function toAuditDetail(row: SqlRow): AuditDetailReadModel {
  return {
    ...toAuditListItem(row),
    previousValues: fromJson(row, "ValoresAnteriores"),
    newValues: fromJson(row, "ValoresNuevos"),
  };
}

export class MssqlAuditRepository implements AuditRepository {
  constructor(private readonly executor: SqlExecutor) {}

  /**
   * Registra la entrada. Con `executor` el SP corre en la transacción del
   * llamador (mismo bloque atómico que el cambio de negocio); sin executor
   * usa la sesión propia del repositorio.
   */
  async append(entry: AuditEntry, executor?: CommandExecutor): Promise<void> {
    const statement = (session: CommandExecutor) =>
      session.execute(PROCEDURES.append, [
        { name: "IDUsuario", type: sql.Int, value: entry.userId },
        { name: "IDModulo", type: sql.SmallInt, value: entry.moduleCode },
        { name: "TipoEntidad", type: sql.NVarChar(50), value: entry.entityType },
        {
          name: "IdentificadorEntidad",
          type: sql.NVarChar(50),
          value: entry.entityIdentifier,
        },
        { name: "Accion", type: sql.NVarChar(20), value: entry.action },
        {
          name: "ValoresAnteriores",
          type: sql.NVarChar(sql.MAX),
          value: toJson(entry.previousValues),
        },
        {
          name: "ValoresNuevos",
          type: sql.NVarChar(sql.MAX),
          value: toJson(entry.newValues),
        },
      ]);

    if (executor !== undefined) {
      await statement(executor);
      return;
    }
    await this.executor.execute(PROCEDURES.append, [
      { name: "IDUsuario", type: sql.Int, value: entry.userId },
      { name: "IDModulo", type: sql.SmallInt, value: entry.moduleCode },
      { name: "TipoEntidad", type: sql.NVarChar(50), value: entry.entityType },
      {
        name: "IdentificadorEntidad",
        type: sql.NVarChar(50),
        value: entry.entityIdentifier,
      },
      { name: "Accion", type: sql.NVarChar(20), value: entry.action },
      {
        name: "ValoresAnteriores",
        type: sql.NVarChar(sql.MAX),
        value: toJson(entry.previousValues),
      },
      {
        name: "ValoresNuevos",
        type: sql.NVarChar(sql.MAX),
        value: toJson(entry.newValues),
      },
    ]);
  }

  async list(
    filter: ListAuditEntriesFilter,
  ): Promise<PaginatedReadModel<AuditListItemReadModel>> {
    // El procedimiento devuelve dos conjuntos: [0] total de coincidencias, [1] página solicitada.
    const result = await this.executor.execute(PROCEDURES.list, [
      { name: "IDModulo", type: sql.SmallInt, value: filter.moduleCode },
      { name: "Pagina", type: sql.Int, value: filter.page },
      { name: "TamanoPagina", type: sql.Int, value: filter.pageSize },
    ]);

    const countRow = firstRow(result.recordsets[0]);
    const totalItems =
      countRow === null ? 0 : readNumber(countRow, "TotalFilas");
    const items = (result.recordsets[1] ?? []).map(toAuditListItem);

    return {
      items,
      page: filter.page,
      pageSize: filter.pageSize,
      totalItems,
      totalPages:
        filter.pageSize > 0 ? Math.ceil(totalItems / filter.pageSize) : 0,
    };
  }

  async findById(id: string): Promise<AuditDetailReadModel | null> {
    const result = await this.executor.execute(PROCEDURES.findDetail, [
      { name: "IDBitacora", type: sql.BigInt, value: id },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toAuditDetail(row);
  }
}

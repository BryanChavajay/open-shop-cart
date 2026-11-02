import sql from "mssql";
import type { CartSnapshot } from "../../../../domain/cart/entities/cart.entity.js";
import type {
  AbandonedCartRow,
  CartReadRepository,
  CartWriteRepository,
} from "../../../../domain/cart/interfaces/repositories/cart.repository.js";
import { CartStatus } from "../../../../domain/cart/enums/cart-status.enum.js";
import type { PaginatedReadModel } from "../../../../domain/shared/readmodels/paginated.read-model.js";
import type { CommandExecutor } from "../../../../domain/shared/interfaces/providers/sql-executor.js";
import {
  firstRow,
  parseEnum,
  readDate,
  readNullableString,
  readNumber,
  readString,
  readUuid,
} from "../mssql-helpers.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";

const PROCEDURES = {
  create: "SP_Carritos_Crear",
  updateActivity: "SP_Carritos_ActividadRegistrar",
  changeStatus: "SP_Carritos_EstadoActualizar",
  findActiveByTokenHash: "SP_Carritos_ObtenerActivoPorHashToken",
  listAbandoned: "SP_Carritos_AbandonadosListar",
} as const;

const TOKEN_HASH_LENGTH = 64;

/** Reads a DATETIME2 column exposed as a JS `Date` by the driver into ISO 8601 UTC string. */
function readIsoDate(row: SqlRow, column: string): string {
  return readDate(row, column).toISOString();
}

/** Reads a nullable DATETIME2 column into ISO 8601 UTC string, or null. */
function readNullableIsoDate(row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  throw new TypeError(`Se esperaba fecha o nulo en la columna ${column}`);
}

/** Reads a nullable INT column, or null. */
function readNullableNumber(row: SqlRow, column: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "number") {
    throw new TypeError(`Se esperaba número o nulo en la columna ${column}`);
  }
  return value;
}

/**
 * Reads the single unnamed `COUNT(*)` column: the driver exposes it with an
 * empty column name, so it is taken positionally instead of by label.
 */
function readFirstColumnNumber(row: SqlRow): number {
  const keys = Object.keys(row);
  if (keys.length < 1) {
    throw new Error("El procedimiento almacenado no devolvió filas");
  }
  const key = keys[0];
  if (key === undefined) {
    throw new Error("El procedimiento almacenado no devolvió filas");
  }
  const value = row[key];
  if (typeof value !== "number") {
    throw new TypeError("Se esperaba número en la columna de conteo");
  }
  return value;
}

function toCartSnapshot(row: SqlRow): CartSnapshot {
  return {
    id: readNumber(row, "IDCarrito"),
    publicId: readUuid(row, "IDPublico"),
    tokenHash: readString(row, "HashToken"),
    userId: readNullableNumber(row, "IDUsuario"),
    status: parseEnum(CartStatus, readString(row, "Estado"), "Estado"),
    createdAt: readIsoDate(row, "FechaCreacion"),
    lastActivityAt: readIsoDate(row, "FechaUltimaActividad"),
    closedAt: readNullableIsoDate(row, "FechaCierre"),
  };
}

function toAbandonedCartRow(row: SqlRow): AbandonedCartRow {
  return {
    publicId: readUuid(row, "IDPublico"),
    userPublicId: readNullableUserPublicId(row, "IDPublicoUsuario"),
    createdAt: readIsoDate(row, "FechaCreacion"),
    lastActivityAt: readIsoDate(row, "FechaUltimaActividad"),
    closedAt: readNullableIsoDate(row, "FechaCierre"),
  };
}

/** UUID normalizado a minúsculas, aceptando nulo para carritos de invitado. */
function readNullableUserPublicId(row: SqlRow, column: string): string | null {
  const value = readNullableString(row, column);
  return value === null ? null : value.toLowerCase();
}

/** Builds the paginated result exactly like the rest of the repositories. */
function toPaginated<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): PaginatedReadModel<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0,
  };
}

/**
 * Cart persistence on SQL Server through stored procedures.
 *
 * Every method takes the use-case `CommandExecutor` (UnitOfWork transaction);
 * when null, the statement runs standalone on the executor given to the
 * constructor. No method opens transactions. The THROW of the creation
 * procedure (50300, unknown user) propagates as a mapped SQL error: business
 * validation stays in the use cases.
 */
export class MssqlCartRepository implements CartReadRepository, CartWriteRepository {
  constructor(private readonly executor: SqlExecutor) {}

  /** Falls back to the base executor for standalone reads and writes. */
  private resolveExecutor(executor: CommandExecutor | null): CommandExecutor {
    return executor ?? this.executor;
  }

  async findActiveByTokenHash(
    executor: CommandExecutor | null,
    tokenHash: string,
  ): Promise<CartSnapshot | null> {
    const result = await this.resolveExecutor(executor).execute(
      PROCEDURES.findActiveByTokenHash,
      [
        {
          name: "HashToken",
          type: sql.Char(TOKEN_HASH_LENGTH),
          value: tokenHash,
        },
      ],
    );
    const row = firstRow(result.recordset);
    return row === null ? null : toCartSnapshot(row);
  }

  async listAbandoned(
    executor: CommandExecutor | null,
    cutoffIso: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedReadModel<AbandonedCartRow>> {
    const result = await this.resolveExecutor(executor).execute(
      PROCEDURES.listAbandoned,
      [
        { name: "FechaCorte", type: sql.DateTime2(3), value: cutoffIso },
        { name: "Pagina", type: sql.Int, value: page },
        { name: "TamanoPagina", type: sql.Int, value: pageSize },
      ],
    );
    const countRecordset = result.recordsets[0];
    const pageRows = result.recordsets[1] ?? [];
    const countRow = firstRow(countRecordset);
    const totalItems = countRow === null ? 0 : readFirstColumnNumber(countRow);
    return toPaginated(pageRows.map(toAbandonedCartRow), page, pageSize, totalItems);
  }

  async create(
    executor: CommandExecutor | null,
    cart: CartSnapshot,
  ): Promise<void> {
    await this.resolveExecutor(executor).execute(PROCEDURES.create, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: cart.publicId },
      {
        name: "HashToken",
        type: sql.Char(TOKEN_HASH_LENGTH),
        value: cart.tokenHash,
      },
      { name: "IDUsuario", type: sql.Int, value: cart.userId },
    ]);
  }

  async updateActivity(
    executor: CommandExecutor | null,
    cartId: number,
    asOfIso: string,
  ): Promise<boolean> {
    const result = await this.resolveExecutor(executor).execute(
      PROCEDURES.updateActivity,
      [
        { name: "IDCarrito", type: sql.Int, value: cartId },
        { name: "FechaHora", type: sql.DateTime2(3), value: asOfIso },
      ],
    );
    const row = firstRow(result.recordset);
    return row !== null && readNumber(row, "FilasAfectadas") === 1;
  }

  async changeStatus(
    executor: CommandExecutor | null,
    cartId: number,
    status: CartStatus,
    asOfIso: string,
  ): Promise<boolean> {
    const result = await this.resolveExecutor(executor).execute(
      PROCEDURES.changeStatus,
      [
        { name: "IDCarrito", type: sql.Int, value: cartId },
        { name: "EstadoNuevo", type: sql.NVarChar(20), value: status },
        { name: "FechaHora", type: sql.DateTime2(3), value: asOfIso },
      ],
    );
    const row = firstRow(result.recordset);
    return row !== null && readNumber(row, "FilasAfectadas") === 1;
  }
}

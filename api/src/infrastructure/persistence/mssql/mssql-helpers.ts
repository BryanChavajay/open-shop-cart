import sql from "mssql";
import type { RequestError } from "mssql";
import type { SqlRow } from "./sql-executor.js";

/** Códigos de SQL Server para violación de restricciones UNIQUE (2627) y de índices únicos (2601). */
const UNIQUE_VIOLATION_NUMBERS: ReadonlySet<number> = new Set([2601, 2627]);

/** Indica si el error del driver es una violación de unicidad. */
export function isUniqueViolation(error: unknown): error is RequestError {
  return (
    error instanceof sql.RequestError &&
    error.number !== undefined &&
    UNIQUE_VIOLATION_NUMBERS.has(error.number)
  );
}

/** Indica si el error es una violación de unicidad de una restricción concreta (por nombre). */
export function isUniqueViolationOf(error: unknown, constraintName: string): boolean {
  return isUniqueViolation(error) && error.message.includes(constraintName);
}

function readColumn(row: SqlRow, column: string): unknown {
  if (!(column in row)) {
    throw new Error(`La columna ${column} no está presente en el resultado`);
  }
  return row[column];
}

export function readString(row: SqlRow, column: string): string {
  const value = readColumn(row, column);
  if (typeof value !== "string") {
    throw new TypeError(`Se esperaba texto en la columna ${column}`);
  }
  return value;
}

export function readNullableString(row: SqlRow, column: string): string | null {
  const value = readColumn(row, column);
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TypeError(`Se esperaba texto o nulo en la columna ${column}`);
  }
  return value;
}

/** Lee un UUID. SQL Server lo devuelve en mayúsculas; se normaliza a minúsculas. */
export function readUuid(row: SqlRow, column: string): string {
  return readString(row, column).toLowerCase();
}

export function readNumber(row: SqlRow, column: string): number {
  const value = readColumn(row, column);
  if (typeof value !== "number") {
    throw new TypeError(`Se esperaba número en la columna ${column}`);
  }
  return value;
}

export function readBoolean(row: SqlRow, column: string): boolean {
  const value = readColumn(row, column);
  if (typeof value !== "boolean") {
    throw new TypeError(`Se esperaba booleano en la columna ${column}`);
  }
  return value;
}

export function readDate(row: SqlRow, column: string): Date {
  const value = readColumn(row, column);
  if (!(value instanceof Date)) {
    throw new TypeError(`Se esperaba fecha en la columna ${column}`);
  }
  return value;
}

export function readNullableDate(row: SqlRow, column: string): Date | null {
  const value = readColumn(row, column);
  if (value === null) {
    return null;
  }
  if (!(value instanceof Date)) {
    throw new TypeError(`Se esperaba fecha o nulo en la columna ${column}`);
  }
  return value;
}

/** Convierte un valor de columna a un valor de enumeración de dominio de tipo string. */
export function parseEnum<T extends string>(
  enumObject: Readonly<Record<string, T>>,
  value: unknown,
  column: string,
): T {
  const match = Object.values(enumObject).find((candidate) => candidate === value);
  if (match === undefined) {
    throw new Error(`Valor no reconocido en la columna ${column}`);
  }
  return match;
}

/** Primera fila del conjunto, o null si está vacío. */
export function firstRow(rows: readonly SqlRow[] | undefined): SqlRow | null {
  return rows?.[0] ?? null;
}

/** Primera fila del conjunto. Falla si el procedimiento no devolvió ninguna. */
export function requireFirstRow(rows: readonly SqlRow[] | undefined): SqlRow {
  const row = firstRow(rows);
  if (row === null) {
    throw new Error("El procedimiento almacenado no devolvió filas");
  }
  return row;
}

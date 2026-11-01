import type { ConnectionPool, ISqlType, Request, Transaction } from "mssql";
import { mapSqlError } from "./sql-error.js";

/** Fila devuelta por SQL Server, indexada por el alias de cada columna. */
export type SqlRow = Record<string, unknown>;

/** Parámetro de entrada de un stored procedure. `name` va sin el prefijo @. */
export interface SqlParam {
  name: string;
  type: (() => ISqlType) | ISqlType;
  value: unknown;
}

export interface SqlResult {
  /** Primer conjunto de resultados. Vacío si el procedimiento no devuelve filas. */
  recordset: SqlRow[];
  /** Todos los conjuntos de resultados, en el orden en que los devuelve el procedimiento. */
  recordsets: SqlRow[][];
  /** Suma de filas afectadas según el driver. Para conteos exactos, el procedimiento devuelve una columna explícita. */
  rowsAffected: number;
}

/**
 * Executes stored procedures through a session. Write procedures own their transactions.
 */
export interface SqlExecutor {
  execute(procedure: string, params: SqlParam[]): Promise<SqlResult>;
}

async function runProcedure(
  request: Request,
  procedure: string,
  params: readonly SqlParam[],
): Promise<SqlResult> {
  for (const param of params) {
    request.input(param.name, param.type, param.value);
  }
  const result = await request.execute<SqlRow>(procedure);
  return {
    recordset: result.recordset ?? [],
    recordsets: result.recordsets ?? [],
    rowsAffected: result.rowsAffected.reduce((total, count) => total + count, 0),
  };
}

/** Ejecuta procedimientos sobre una conexión del pool (sin transacción). */
export class PoolSqlExecutor implements SqlExecutor {
  constructor(private readonly pool: ConnectionPool) {}

  async execute(procedure: string, params: SqlParam[]): Promise<SqlResult> {
    try { return await runProcedure(this.pool.request(), procedure, params); }
    catch (error: unknown) { throw mapSqlError(error); }
  }
}

/** Ejecuta procedimientos sobre una transacción activa: fija la misma conexión. */
export class TransactionSqlExecutor implements SqlExecutor {
  constructor(private readonly transaction: Transaction) {}

  async execute(procedure: string, params: SqlParam[]): Promise<SqlResult> {
    try { return await runProcedure(this.transaction.request(), procedure, params); }
    catch (error: unknown) { throw mapSqlError(error); }
  }
}

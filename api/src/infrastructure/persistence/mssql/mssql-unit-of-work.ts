import sql, { type ConnectionPool } from "mssql";
import { TransactionSqlExecutor, type SqlExecutor } from "./sql-executor.js";

/**
 * Runs the callback inside a single SQL transaction; any error rolls back every write.
 */
export interface UnitOfWork {
  run<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T>;
}

export class MssqlUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: ConnectionPool) {}

  async run<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> {
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    try {
      const result = await work(new TransactionSqlExecutor(transaction));
      await transaction.commit();
      return result;
    } catch (error: unknown) {
      try { await transaction.rollback(); } catch { /* already aborted by the database */ }
      throw error;
    }
  }
}

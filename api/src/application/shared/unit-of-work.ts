import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";

/**
 * Transactional boundary port of the application layer, shared across every
 * business module (catalog, inventory, ...).
 *
 * The infrastructure unit of work (MssqlUnitOfWork) satisfies this port
 * structurally: `run` receives the transaction's executor and any error rolls
 * back every write performed through it.
 */
export interface UnitOfWork {
  run<T>(work: TransactionScope<T>): Promise<T>;
}

/** Work to run inside one transaction, receiving its executor. */
export type TransactionScope<T> = (executor: CommandExecutor) => Promise<T>;

/**
 * Reuses a caller-provided executor (joining an already open transaction) or
 * opens a fresh one through the unit of work.
 */
export function runOrJoin<T>(
  executor: CommandExecutor | null,
  unitOfWork: UnitOfWork,
  work: TransactionScope<T>,
): Promise<T> {
  return executor === null ? unitOfWork.run(work) : work(executor);
}

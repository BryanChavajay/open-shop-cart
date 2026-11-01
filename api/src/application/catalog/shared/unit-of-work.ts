import type { CommandExecutor } from "../../../domain/shared/interfaces/providers/sql-executor.js";

/**
 * Transactional boundary port of the application layer.
 *
 * The infrastructure unit of work (MssqlUnitOfWork) satisfies this port
 * structurally: `run` receives the transaction's executor and any error rolls
 * back every write performed through it.
 */
export interface UnitOfWork {
  run<T>(work: (executor: CommandExecutor) => Promise<T>): Promise<T>;
}

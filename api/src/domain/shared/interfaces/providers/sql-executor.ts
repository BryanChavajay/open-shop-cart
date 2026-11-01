/**
 * Minimal persistence execution contract for the domain layer.
 *
 * The infrastructure `SqlExecutor` is structurally compatible with
 * `CommandExecutor`; stage-3 adapters (or structural casts) hand it over inside
 * use-case transactions without importing infrastructure types here.
 */

/** Input parameter for a stored procedure call. `type` is opaque to the domain. */
export interface CommandParam {
  /** Parameter name, without the `@` prefix. */
  name: string;
  /** Driver-specific SQL type descriptor. */
  type: unknown;
  value: unknown;
}

/** Result of a stored procedure call. */
export interface CommandResult {
  /** First result set. Empty when the procedure returns no rows. */
  recordset: Record<string, unknown>[];
  /** Every result set, in the order the procedure returns them. */
  recordsets: Record<string, unknown>[][];
  /** Total affected rows reported by the driver. */
  rowsAffected: number;
}

/** Executes stored procedures over an active session (pool or transaction). */
export interface CommandExecutor {
  execute(procedure: string, params: CommandParam[]): Promise<CommandResult>;
}

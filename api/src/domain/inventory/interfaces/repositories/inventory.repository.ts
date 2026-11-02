import type { CommandExecutor } from "../../../shared/interfaces/providers/sql-executor.js";
import type { PaginatedReadModel } from "../../../shared/readmodels/paginated.read-model.js";
import type { StockBalanceSnapshot } from "../../entities/stock-balance.entity.js";
import type { StockMovementSnapshot } from "../../entities/inventory-movement.entity.js";
import type { StockReservationSnapshot } from "../../entities/stock-reservation.entity.js";
import type { ReservationHistorySnapshot } from "../../entities/reservation-history.entity.js";
import type { InventoryMovementReadModel } from "../../readmodels/inventory-movement.read-model.js";
import type { InventoryListItemReadModel } from "../../readmodels/inventory-list-item.read-model.js";
import { StockMovementType } from "../../enums/stock-movement-type.enum.js";
import { StockReservationStatus } from "../../enums/reservation-status.enum.js";

/** Filters for the paginated inventory balance listing. */
export interface InventoryListFilter {
  /** Optional text matched against SKU or product name. */
  searchText?: string;
  /** When true, only variants with positive available quantity are listed. */
  onlyAvailable?: boolean;
  /** Optional filter by variant active state. */
  isActive?: boolean;
  /** Page number, starting at 1. */
  page: number;
  /** Page size in rows. */
  pageSize: number;
}

/** Filters for the paginated kardex listing of one variant. */
export interface MovementListFilter {
  /** Public identifier of the variant whose kardex is listed. */
  variantPublicId: string;
  /** Optional movement type filter. */
  movementType?: StockMovementType;
  /** Optional lower bound for the movement instant (inclusive, ISO string). */
  from?: string;
  /** Optional upper bound for the movement instant (inclusive, ISO string). */
  to?: string;
  /** Page number, starting at 1. */
  page: number;
  /** Page size in rows. */
  pageSize: number;
}

/** Contents of one idempotency operation record. */
export interface IdempotencyOperationData {
  /** Logical type of the operation (receipt, adjustment...). */
  operationType: string;
  /** Client-provided idempotency key, unique per operation type. */
  idempotencyKey: string;
  /** Hash of the operation payload used to detect conflicting replays. */
  fingerprint: string;
  /** Public identifier returned by the original operation, if any. */
  resultPublicId: string | null;
  /** Public identifier of the affected variant, if any. */
  variantPublicId: string | null;
  /** Internal identifier of the user who performed the operation. */
  userId: number;
}

/**
 * Read-only data access for stock balances, kardex listings and reservations,
 * matching the style of the catalog read repository. All reserved quantities
 * are computed inside SQL for a supplied `asOf` instant, so expiry never
 * depends on a cleanup worker.
 */
export interface InventoryReadRepository {
  /** Binds the executor of the active transaction for in-transaction calls. */
  withExecutor(executor: CommandExecutor): InventoryReadRepository;
  /**
   * Full balance of one variant. Reserved quantity is computed for `asOf`
   * inside SQL. Null when the variant does not exist.
   */
  findBalanceByPublicId(variantPublicId: string, asOf: string): Promise<StockBalanceSnapshot | null>;
  /**
   * Locked (`UPDLOCK`/`HOLDLOCK`) balance read of the given variants, used
   * before mutations to serialize concurrent stock changes.
   */
  fetchLockedBalances(
    executor: CommandExecutor,
    variantPublicIds: string[],
    asOf: string,
  ): Promise<StockBalanceSnapshot[]>;
  /**
   * Reserved units per variant public id for ACTIVE, unexpired reservations at
   * `asOf`, read under the same locks as the balances.
   */
  sumActiveReserved(
    executor: CommandExecutor,
    variantPublicIds: string[],
    asOf: string,
  ): Promise<Map<string, number>>;
  /**
   * True when any variant still has physical stock or ACTIVE, unexpired
   * reservations at `asOf`. Locked read (`UPDLOCK`/`HOLDLOCK`, shared
   * ascending order) used inside transactions to block logical deletion of
   * catalog entities against concurrent stock mutations.
   */
  hasStockOrActiveReservations(
    executor: CommandExecutor,
    variantInternalIds: number[],
    asOf: string,
  ): Promise<boolean>;
  /** Paginated inventory balances matching the filters. */
  listInventory(filters: InventoryListFilter): Promise<PaginatedReadModel<InventoryListItemReadModel>>;
  /** Paginated kardex movements of one variant matching the filters. */
  listMovements(filters: MovementListFilter): Promise<PaginatedReadModel<InventoryMovementReadModel>>;
  /** Reservation with its lines, regardless of state. Null when not found. */
  findReservationByPublicId(publicId: string): Promise<StockReservationSnapshot | null>;
  /**
   * Locked read of one reservation only when it is ACTIVE and not expired at
   * `asOf`. Null otherwise; used by consumption flows to reject expired ones.
   */
  fetchActiveReservation(
    executor: CommandExecutor,
    publicId: string,
    asOf: string,
  ): Promise<StockReservationSnapshot | null>;
  /**
   * Locked (`UPDLOCK`) read of one reservation regardless of state. Used by
   * release and expiry flows that must inspect the current state first.
   */
  fetchLockedReservation(executor: CommandExecutor, publicId: string): Promise<StockReservationSnapshot | null>;
  /**
   * Reservation with its lines holding the given source reference, regardless
   * of state. Null when no reservation ever used it. Plain read used as the
   * duplicate pre-check and idempotent replay of the reservation use case.
   */
  findReservationBySourceReference(sourceReference: string, asOf: string): Promise<StockReservationSnapshot | null>;
  /**
   * One movement by its public identifier, regardless of type. Plain read.
   * Null when not found. Used by reintegrations to validate the original sale
   * movement they reintegrate against.
   */
  findMovementByPublicId(publicId: string): Promise<StockMovementSnapshot | null>;
  /**
   * Units already reintegrated against one sale movement by SALE_CANCELLATION
   * and CUSTOMER_RETURN movements that reference it. Locked read used inside
   * the reintegration transaction to cap cumulative compensations.
   */
  sumReintegrated(executor: CommandExecutor, saleMovementPublicId: string): Promise<number>;
  /**
   * Up to `limit` reservations whose deadline already passed at `asOf`, read
   * under locks, ready for automatic expiry processing.
   */
  listExpiredReservations(executor: CommandExecutor, limit: number, asOf: string): Promise<StockReservationSnapshot[]>;
}

/**
 * Write-side data access for the inventory module. Every method takes an
 * `executor` bound to the caller's transaction; no method opens transactions.
 * Business validation is the responsibility of use cases and entities: the
 * persistence layer only executes procedures and propagates their failures.
 */
export interface InventoryWriteRepository {
  /**
   * Applies a signed change to the variant's `ExistenciaFisica`. The variable
   * must be validated beforehand; the procedures throw when the resulting
   * stock would be impossible, and the affected-row contract is enforced by
   * them. Never called by catalog code.
   */
  applyPhysicalStockChange(executor: CommandExecutor, variantInternalId: number, quantityDelta: number): Promise<void>;
  /**
   * Appends one kardex movement and returns its internal id. The snapshot id is
   * null on input; balances are persisted as sent by the use case.
   */
  insertMovement(executor: CommandExecutor, movement: StockMovementSnapshot): Promise<number>;
  /**
   * Persists a reservation atomically: header, lines and the CREATED history
   * entry in one procedure call. Returns the reservation internal id.
   */
  insertReservation(executor: CommandExecutor, reservation: StockReservationSnapshot): Promise<number>;
  /** Transitions the reservation status (ACTIVE → CONSUMED/RELEASED/EXPIRED). */
  updateReservationStatus(
    executor: CommandExecutor,
    reservationInternalId: number,
    status: StockReservationStatus,
  ): Promise<void>;
  /** Appends one entry to the reservation history ledger. */
  insertReservationHistory(executor: CommandExecutor, entry: ReservationHistorySnapshot): Promise<void>;
  /**
   * Records the idempotency receipt of a write operation. Must be called in
   * the same transaction as the operation itself.
   */
  saveOperation(executor: CommandExecutor, operation: IdempotencyOperationData): Promise<void>;
  /** Stored receipt for the given operation type and idempotency key, or null. */
  findOperation(
    executor: CommandExecutor,
    operationType: string,
    idempotencyKey: string,
  ): Promise<IdempotencyOperationData | null>;
}

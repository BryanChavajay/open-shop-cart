import { StockReservation } from "../../domain/inventory/entities/stock-reservation.entity.js";
import { ReservationHistory } from "../../domain/inventory/entities/reservation-history.entity.js";
import type {
  InventoryReadRepository,
  InventoryWriteRepository,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import { ReservationHistoryAction } from "../../domain/inventory/enums/reservation-history-action.enum.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { requirePositiveInteger } from "../../domain/inventory/entities/inventory-rules.js";
import type { UnitOfWork } from "../shared/unit-of-work.js";
import { EXPIRY_BATCH_SIZE } from "./shared/options.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface ExpireStockReservationsCommand {
  /** Maximum reservations processed in this cycle. Defaults to EXPIRY_BATCH_SIZE. */
  limit?: number | undefined;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

export interface ExpiredStockReservationsResult {
  expired: number;
}

/**
 * Automatically expires the reservations whose deadline passed: state
 * transition to EXPIRED plus the automatic history entry, with no physical
 * change, no kardex entry and no audit record. The reserved availability is
 * released implicitly because computations filter by ACTIVE status.
 *
 * Isolation: when joining a caller transaction all expiries share it and a
 * failure interrupts the whole batch; otherwise every reservation is processed
 * in its own transaction so one failure (e.g. raced by a concurrent consume)
 * does not block the rest.
 */
export class ExpireStockReservations {
  constructor(
    private readonly reads: InventoryReadRepository,
    private readonly writes: InventoryWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ExpireStockReservationsCommand,
  ): Promise<ExpiredStockReservationsResult> {
    const limit = command.limit ?? EXPIRY_BATCH_SIZE;
    requirePositiveInteger(limit, "limit");
    const asOf = this.clock.now().toISOString();

    const joinExecutor = command.joinExecutor ?? null;
    const snapshots =
      joinExecutor === null
        ? await this.unitOfWork.run((exec) =>
            this.reads.listExpiredReservations(exec, limit, asOf),
          )
        : await this.reads.listExpiredReservations(joinExecutor, limit, asOf);

    let expired = 0;
    if (joinExecutor === null) {
      for (const snapshot of snapshots) {
        // One transaction per reservation: a raced or failed one is skipped.
        const done = await this.unitOfWork
          .run((exec) => this.expireOne(exec, snapshot.publicId, asOf))
          .catch(() => false);
        if (done) {
          expired += 1;
        }
      }
      return { expired };
    }

    for (const snapshot of snapshots) {
      // Joined execution: failures propagate to the caller's transaction.
      if (await this.expireOne(joinExecutor, snapshot.publicId, asOf)) {
        expired += 1;
      }
    }
    return { expired };
  }

  /** Expires one reservation under the given transaction executor. */
  private async expireOne(
    exec: CommandExecutor,
    publicId: string,
    asOf: string,
  ): Promise<boolean> {
    const snapshot = await this.reads.fetchLockedReservation(exec, publicId);
    if (snapshot === null) {
      return false;
    }
    const reservation = StockReservation.restore(snapshot);
    reservation.expire(asOf);

    await this.writes.updateReservationStatus(
      exec,
      requireInternalId(reservation.id),
      reservation.status,
    );
    await this.writes.insertReservationHistory(
      exec,
      ReservationHistory.create({
        reservationPublicId: reservation.publicId,
        action: ReservationHistoryAction.EXPIRED,
        userId: null,
        reason: null,
        occurredAt: this.clock.now().toISOString(),
      }),
    );
    return true;
  }
}

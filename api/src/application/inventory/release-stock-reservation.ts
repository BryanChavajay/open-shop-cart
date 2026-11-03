import { StockReservation } from "../../domain/inventory/entities/stock-reservation.entity.js";
import { ReservationHistory } from "../../domain/inventory/entities/reservation-history.entity.js";
import type {
  InventoryReadRepository,
  InventoryWriteRepository,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import { ReservationHistoryAction } from "../../domain/inventory/enums/reservation-history-action.enum.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import {
  REASON_MAX_LENGTH,
  requirePublicId,
  requirePositiveInteger,
  requireTrimmedText,
} from "../../domain/inventory/entities/inventory-rules.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";
import type { InventoryActor } from "./shared/dependencies.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface ReleaseStockReservationCommand {
  actor: InventoryActor;
  reservationPublicId: string;
  /** Optional documentation of the manual release. */
  reason?: string | null | undefined;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

/**
 * Manually releases an active reservation before its deadline: no physical
 * change, no kardex entry, no audit record. Traceability is kept exclusively
 * in the reservation history ledger. Unknown reservations report
 * NotFoundError/STOCK_RESERVATION_NOT_FOUND; non-active reservations are
 * rejected by the entity with STOCK_RESERVATION_INVALID_STATE.
 */
export class ReleaseStockReservation {
  constructor(
    private readonly reads: InventoryReadRepository,
    private readonly writes: InventoryWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReleaseStockReservationCommand): Promise<void> {
    const reservationPublicId = requirePublicId(
      command.reservationPublicId,
      "reservationPublicId",
    );
    // The ledger constraint mandates a reason for human actions; the caller
    // may document richer text, otherwise a default is recorded.
    const reason =
      command.reason === null || command.reason === undefined
        ? `Release of reservation ${reservationPublicId}`
        : requireTrimmedText(command.reason, "reason", REASON_MAX_LENGTH);
    requirePositiveInteger(command.actor.id, "actor.id");

    const scope: TransactionScope<void> = async (exec) => {
      const snapshot = await this.reads.fetchLockedReservation(
        exec,
        reservationPublicId,
      );
      if (snapshot === null) {
        throw new NotFoundError(
          "Stock reservation not found",
          ErrorCode.STOCK_RESERVATION_NOT_FOUND,
          undefined,
          undefined,
        );
      }
      const reservation = StockReservation.restore(snapshot);
      reservation.release();

      await this.writes.updateReservationStatus(
        exec,
        requireInternalId(reservation.id),
        reservation.status,
      );
      await this.writes.insertReservationHistory(
        exec,
        ReservationHistory.create({
          reservationPublicId: reservation.publicId,
          action: ReservationHistoryAction.RELEASED,
          userId: command.actor.id,
          reason,
          occurredAt: this.clock.now().toISOString(),
        }),
      );
    };

    return runOrJoin(command.joinExecutor ?? null, this.unitOfWork, scope);
  }
}

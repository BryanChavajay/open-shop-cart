import { StockReservation } from "../../domain/inventory/entities/stock-reservation.entity.js";
import { StockBalance } from "../../domain/inventory/entities/stock-balance.entity.js";
import { ReservationHistory } from "../../domain/inventory/entities/reservation-history.entity.js";
import type {
  InventoryReadRepository,
  InventoryWriteRepository,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { StockMovementType } from "../../domain/inventory/enums/stock-movement-type.enum.js";
import { ReservationHistoryAction } from "../../domain/inventory/enums/reservation-history-action.enum.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import {
  REFERENCE_MAX_LENGTH,
  requirePositiveInteger,
  requirePublicId,
  requireTrimmedText,
} from "../../domain/inventory/entities/inventory-rules.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";
import type { InventoryActor } from "./shared/dependencies.js";
import { auditEntryForInventory } from "./shared/audit.js";
import { assembleStockMovement } from "./shared/movement-assembler.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface ConsumeStockReservationCommand {
  actor: InventoryActor;
  reservationPublicId: string;
  /**
   * Sale reference stored as `relatedSalePublicId` of the generated SALE
   * movements (the anchor used by later reintegrations or chargebacks).
   */
  salePublicId: string;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

export interface ConsumedStockMovementReadModel {
  variantPublicId: string;
  movementPublicId: string;
  quantity: number;
}

export interface ConsumedStockReadModel {
  reservationPublicId: string;
  movements: ConsumedStockMovementReadModel[];
}

/**
 * Consumes an active reservation and dispatches its units: one SALE kardex
 * movement per line (negative delta), the matching physical stock change, an
 * audit record per movement, and the CONSUMED state transition plus its
 * history entry — all inside one transaction.
 *
 * Lock protocol (same transaction): the reservation row is locked and checked
 * first (assertConsume; expired reservations are rejected with
 * STOCK_RESERVATION_EXPIRED, non-active with STOCK_RESERVATION_INVALID_STATE),
 * then the line variants are locked ascending by public id. Expired or
 * unknown reservations report NotFoundError/STOCK_RESERVATION_NOT_FOUND.
 */
export class ConsumeStockReservation {
  constructor(
    private readonly reads: InventoryReadRepository,
    private readonly writes: InventoryWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ConsumeStockReservationCommand,
  ): Promise<ConsumedStockReadModel> {
    const reservationPublicId = requirePublicId(
      command.reservationPublicId,
      "reservationPublicId",
    );
    const salePublicId = requireTrimmedText(
      command.salePublicId,
      "salePublicId",
      REFERENCE_MAX_LENGTH,
    );
    requirePositiveInteger(command.actor.id, "actor.id");

    const scope: TransactionScope<ConsumedStockReadModel> = async (exec) => {
      const now = this.clock.now();
      const asOf = now.toISOString();

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
      reservation.consume(asOf);

      const variantPublicIds = [
        ...new Set(reservation.lines.map((line) => line.variantPublicId)),
      ].toSorted();
      const balances = await this.reads.fetchLockedBalances(
        exec,
        variantPublicIds,
        asOf,
      );
      if (balances.length !== variantPublicIds.length) {
        throw new NotFoundError(
          "Variant not found",
          undefined,
          undefined,
          undefined,
        );
      }
      const balancesByPublicId = new Map(
        balances.map((balance) => [balance.variantPublicId, balance]),
      );

      const reason = `Consumption of reservation ${reservation.publicId}`;
      const movements: ConsumedStockMovementReadModel[] = [];

      for (const line of reservation.lines) {
        const balance = balancesByPublicId.get(line.variantPublicId);
        if (balance === undefined) {
          throw new NotFoundError(
            "Variant not found",
            undefined,
            undefined,
            undefined,
          );
        }
        const stored = StockBalance.restore(balance);
        const applied = stored.applyMovement(
          StockMovementType.SALE,
          -line.quantity,
          reason,
          reservation.sourceReference,
          salePublicId,
          asOf,
        );
        const movement = assembleStockMovement({
          identifiers: this.identifiers,
          clock: this.clock,
          balance: stored,
          movementType: StockMovementType.SALE,
          quantityDelta: applied.quantityDelta,
          balanceBefore: applied.balanceBefore,
          balanceAfter: applied.balanceAfter,
          userId: command.actor.id,
          reason,
          sourceReference: reservation.sourceReference,
          relatedSalePublicId: salePublicId,
        });
        await this.writes.insertMovement(exec, movement.toSnapshot());
        await this.writes.applyPhysicalStockChange(
          exec,
          stored.variantId,
          applied.quantityDelta,
        );
        await this.audit.append(
          auditEntryForInventory(
            {
              entityType: "StockBalance",
              entityIdentifier: line.variantPublicId,
              action: AuditAction.UPDATE,
              previousValues: {
                physicalQuantityBefore: applied.balanceBefore,
                physicalQuantityAfter: applied.balanceAfter,
                reason,
                sourceReference: reservation.sourceReference,
              },
              newValues: {
                physicalQuantityBefore: applied.balanceBefore,
                physicalQuantityAfter: applied.balanceAfter,
                reason,
                sourceReference: reservation.sourceReference,
              },
            },
            command.actor,
          ),
          exec,
        );
        movements.push({
          variantPublicId: line.variantPublicId,
          movementPublicId: movement.publicId,
          quantity: line.quantity,
        });
      }

      await this.writes.updateReservationStatus(
        exec,
        requireInternalId(reservation.id),
        reservation.status,
      );
      await this.writes.insertReservationHistory(
        exec,
        ReservationHistory.create({
          reservationPublicId: reservation.publicId,
          action: ReservationHistoryAction.CONSUMED,
          userId: command.actor.id,
          reason,
          occurredAt: this.clock.now().toISOString(),
        }),
      );

      return { reservationPublicId: reservation.publicId, movements };
    };

    return runOrJoin(command.joinExecutor ?? null, this.unitOfWork, scope);
  }
}

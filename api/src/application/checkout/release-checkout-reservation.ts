import type { InventoryReadRepository } from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { ReleaseStockReservation } from "../inventory/release-stock-reservation.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { requirePublicId } from "../../domain/inventory/entities/inventory-rules.js";

export interface ReleaseCheckoutReservationCommand {
  /** Owning customer, taken from the guarded identity. */
  customerId: number;
  reservationPublicId: string;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

/**
 * Frees the units a customer reserved for a checkout. Ownership is verified
 * first (unknown or foreign reservation = STOCK_RESERVATION_NOT_FOUND 404),
 * then the inventory release runs (single transition to RELEASED, no kardex
 * writes). Freeing an already closed reservation surfaces the inventory
 * invalid-state conflict.
 */
export class ReleaseCheckoutReservation {
  constructor(
    private readonly inventoryReads: InventoryReadRepository,
    private readonly inventory: { release: ReleaseStockReservation },
  ) {}

  async execute(command: ReleaseCheckoutReservationCommand): Promise<void> {
    const reservationPublicId = requirePublicId(
      command.reservationPublicId,
      "reservationPublicId",
    );
    // Plain (lock-free) read used only as the ownership pre-check; the
    // release use case re-locks and re-validates the state anyway.
    const reservation =
      await this.inventoryReads.findReservationByPublicId(reservationPublicId);
    if (reservation === null || reservation.userId !== command.customerId) {
      throw new NotFoundError(
        "Stock reservation not found",
        ErrorCode.STOCK_RESERVATION_NOT_FOUND,
        undefined,
        undefined,
      );
    }
    await this.inventory.release.execute({
      actor: { id: command.customerId },
      reservationPublicId,
      reason: "Checkout reservation released by customer",
      joinExecutor: command.joinExecutor ?? null,
    });
  }
}

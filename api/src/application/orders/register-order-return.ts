import type { CheckoutReadRepository } from "../../domain/checkout/interfaces/repositories/checkout.repository.js";
import type {
  OrderReadRepository,
  OrderWriteRepository,
} from "../../domain/orders/interfaces/repositories/order.repository.js";
import type { OrderLineSnapshot } from "../../domain/orders/entities/order-line.entity.js";
import { applyReturnLine } from "../../domain/orders/entities/order-line.entity.js";
import { Order } from "../../domain/checkout/entities/order.entity.js";
import type { ReintegrateReturnedStock } from "../inventory/reintegrate-returned-stock.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { auditEntryForOrders } from "./shared/audit.js";
import type { OrderActor } from "./shared/dependencies.js";
import { optionalReason } from "./cancel-own-order.js";

/** One line of a customer return request. */
export interface OrderReturnItem {
  /** Public identifier of the order line being returned. */
  linePublicId: string;
  /** Units to return from that line (> 0, or the line entity rejects it). */
  quantity: number;
}

export interface RegisterOrderReturnCommand {
  /** Staff member registering the return (guarded identity). */
  actor: OrderActor;
  orderPublicId: string;
  /** Returned lines with their quantities; at least one item. */
  items: ReadonlyArray<OrderReturnItem>;
  /** Optional documentation of the return (reason, claim reference...). */
  reason?: string;
}

/** Updated state of one returned line. */
export interface OrderReturnLineReadModel {
  linePublicId: string;
  variantPublicId: string;
  sku: string;
  productName: string;
  variantName: string;
  quantity: number;
  /** Total returned units of the line after this return. */
  quantityReturned: number;
}

export interface OrderReturnReadModel {
  orderPublicId: string;
  /** Lines affected by this return, with their updated returned counters. */
  lines: OrderReturnLineReadModel[];
}

/**
 * Registers the customer return of a delivered order (RF-03). The order row
 * is locked and the entity guards that only a DELIVERED order accepts
 * returns; each line revalidates the requested quantity against its
 * purchased units (cumulative counter), then its returned count persists and
 * the units go back to the physical stock (CUSTOMER_RETURN kardex movement)
 * inside the same transaction.
 *
 * An item addressing a line that does not belong to the order is an external
 * identifier inconsistency, so it answers NotFoundError/INVALID_INPUT
 * (field "linePublicId"), coherent with the line-level rejections of the
 * entity; the order-level unknown order stays ORDER_NOT_FOUND.
 */
export class RegisterOrderReturn {
  constructor(
    private readonly checkoutReads: CheckoutReadRepository,
    private readonly orderReads: OrderReadRepository,
    private readonly orderWrites: OrderWriteRepository,
    private readonly inventory: {
      reintegrateReturn: ReintegrateReturnedStock;
    },
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    command: RegisterOrderReturnCommand,
  ): Promise<OrderReturnReadModel> {
    const reason = optionalReason(command.reason);
    const occurredAt = this.clock.now().toISOString();

    const scope: TransactionScope<OrderReturnReadModel> = async (exec) => {
      const snapshot = await this.checkoutReads.findOrderSnapshotLocked(
        exec,
        command.orderPublicId,
      );
      if (snapshot === null) {
        throw new NotFoundError(
          "Order not found",
          ErrorCode.ORDER_NOT_FOUND,
          undefined,
          undefined,
        );
      }
      // Ownership never applies here (staff-only flow); the entity guards the
      // DELIVERED-only window of returns.
      const order = Order.restore(snapshot);
      order.assertReturnable();

      const lines = await this.orderReads.listLines(order.publicId);
      const byLine = new Map(lines.map((line) => [line.linePublicId, line]));

      const updatedLines: OrderReturnLineReadModel[] = [];
      let returnedUnits = 0;
      for (const item of command.items) {
        const line = byLine.get(item.linePublicId);
        if (line === undefined) {
          throw new NotFoundError(
            "Order line not found",
            ErrorCode.INVALID_INPUT,
            "linePublicId",
            undefined,
          );
        }
        const updated = applyReturnLine(line, item.quantity, occurredAt);
        await this.orderWrites.applyLineReturn(exec, {
          linePublicId: updated.linePublicId,
          newQuantityReturned: updated.quantityReturned,
          occurredAt,
        });
        await this.reintegrateReturn(
          command.actor,
          order.publicId,
          item.linePublicId,
          updated,
          item.quantity,
          exec,
        );
        updatedLines.push({
          linePublicId: updated.linePublicId,
          variantPublicId: updated.variantPublicId,
          sku: updated.sku,
          productName: updated.productName,
          variantName: updated.variantName,
          quantity: updated.quantity,
          quantityReturned: updated.quantityReturned,
        });
        returnedUnits += item.quantity;
      }

      await this.audit.append(
        auditEntryForOrders(
          {
            entityType: "OrderReturn",
            entityIdentifier: order.publicId,
            action: AuditAction.UPDATE,
            previousValues: {
              returned: Object.fromEntries(
                lines.map((line) => [line.linePublicId, line.quantityReturned]),
              ),
            },
            newValues: {
              returned: Object.fromEntries(
                updatedLines.map((line) => [
                  line.linePublicId,
                  line.quantityReturned,
                ]),
              ),
              returnedUnits,
              reason,
            },
          },
          command.actor,
        ),
        exec,
      );

      return { orderPublicId: order.publicId, lines: updatedLines };
    };

    return this.unitOfWork.run(scope);
  }

  /**
   * Sends the returned units back to the stock, linked to the original SALE
   * movement of the order.
   */
  private async reintegrateReturn(
    actor: OrderActor,
    orderPublicId: string,
    linePublicId: string,
    updated: OrderLineSnapshot,
    quantity: number,
    exec: CommandExecutor,
  ): Promise<void> {
    await this.inventory.reintegrateReturn.execute({
      actor: { id: actor.id },
      relatedSalePublicId: orderPublicId,
      variantPublicId: updated.variantPublicId,
      returnReference: linePublicId,
      quantity,
      joinExecutor: exec,
    });
  }
}

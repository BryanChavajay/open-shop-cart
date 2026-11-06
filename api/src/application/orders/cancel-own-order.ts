import type {
  CheckoutReadRepository,
  CheckoutWriteRepository,
} from "../../domain/checkout/interfaces/repositories/checkout.repository.js";
import type { OrderWriteRepository } from "../../domain/orders/interfaces/repositories/order.repository.js";
import { Order } from "../../domain/checkout/entities/order.entity.js";
import type { OrderStatus } from "../../domain/checkout/enums/order-status.enum.js";
import type { PaymentStatus } from "../../domain/checkout/enums/payment-status.enum.js";
import { Role } from "../../domain/users/enums/role.enum.js";
import type { ReintegrateCancelledSale } from "../inventory/reintegrate-cancelled-sale.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { auditEntryForOrders } from "./shared/audit.js";
import type { OrderActor } from "./shared/dependencies.js";

export interface CancelOwnOrderCommand {
  /** Customer taken from the guarded identity, never from the URL. */
  actor: OrderActor;
  orderPublicId: string;
  /** Optional documentation of the customer's cancellation. */
  reason?: string;
}

export interface OrderCancellationReadModel {
  orderPublicId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  /** Units sent back to the physical stock during the cancellation. */
  reintegratedUnits: number;
}

/** Optional reason helper shared by both cancellation flows. */
export function optionalReason(reason?: string): string | null {
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Customer cancellation of one own order. The order row is locked, the entity
 * guards the customer window (PENDING_PAYMENT_VERIFICATION | CONFIRMED) and
 * the payment move (PAID -> REFUNDED, pending -> REJECTED). Every pending unit
 * of the order is reintegrated to the stock with its SALE_CANCELLATION kardex
 * movement, and the state move, history and audit all commit in one
 * transaction.
 */
export class CancelOwnOrder {
  constructor(
    private readonly checkoutReads: CheckoutReadRepository,
    private readonly checkoutWrites: CheckoutWriteRepository,
    private readonly orderWrites: OrderWriteRepository,
    private readonly inventory: {
      reintegrateCancellation: ReintegrateCancelledSale;
    },
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    command: CancelOwnOrderCommand,
  ): Promise<OrderCancellationReadModel> {
    const reason = optionalReason(command.reason);
    const occurredAt = this.clock.now().toISOString();

    const scope: TransactionScope<OrderCancellationReadModel> = async (
      exec,
    ) => {
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
      const order = Order.restore(snapshot);
      order.assertOwnedBy(command.actor.id);
      order.cancel(Role.CLIENTE, occurredAt);
      const updated = order.toSnapshot();

      let reintegratedUnits = 0;
      const lines = await this.checkoutReads.listOrderLines(
        exec,
        updated.id!,
      );
      for (const line of lines) {
        const pending = line.quantity - line.quantityReturned;
        if (pending <= 0) {
          continue;
        }
        await this.inventory.reintegrateCancellation.execute({
          actor: { id: command.actor.id },
          orderId: updated.id!,
          variantId: line.variantId,
          variantPublicId: line.variantPublicId,
          quantity: pending,
          joinExecutor: exec,
        });
        reintegratedUnits += pending;
      }

      await this.orderWrites.applyStatusTransition(exec, {
        orderId: updated.id!,
        orderStatus: updated.orderStatus,
        paymentStatus: updated.paymentStatus,
        occurredAt,
      });

      await this.checkoutWrites.appendOrderHistory(exec, {
        orderId: updated.id!,
        previousStatus: snapshot.orderStatus,
        newStatus: updated.orderStatus,
        userId: command.actor.id,
        reason,
        occurredAt,
      });

      await this.audit.append(
        auditEntryForOrders(
          {
            entityType: "Order",
            entityIdentifier: updated.publicId,
            action: AuditAction.UPDATE,
            previousValues: {
              orderStatus: snapshot.orderStatus,
              paymentStatus: snapshot.paymentStatus,
            },
            newValues: {
              decision: "CUSTOMER_CANCEL",
              orderStatus: updated.orderStatus,
              paymentStatus: updated.paymentStatus,
              reintegratedUnits,
              reason,
            },
          },
          command.actor,
        ),
        exec,
      );

      return {
        orderPublicId: updated.publicId,
        orderNumber: updated.orderNumber,
        orderStatus: updated.orderStatus,
        paymentStatus: updated.paymentStatus,
        reintegratedUnits,
      };
    };

    return this.unitOfWork.run(scope);
  }
}

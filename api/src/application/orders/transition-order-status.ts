import type {
  CheckoutReadRepository,
  CheckoutWriteRepository,
} from "../../domain/checkout/interfaces/repositories/checkout.repository.js";
import type { OrderWriteRepository } from "../../domain/orders/interfaces/repositories/order.repository.js";
import { Order } from "../../domain/checkout/entities/order.entity.js";
import { OrderStatus } from "../../domain/checkout/enums/order-status.enum.js";
import type { PaymentStatus } from "../../domain/checkout/enums/payment-status.enum.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { auditEntryForOrders } from "./shared/audit.js";
import type { OrderActor } from "./shared/dependencies.js";
import { optionalReason } from "./cancel-own-order.js";

export interface TransitionOrderStatusCommand {
  /** Staff member performing the transition (guarded identity). */
  actor: OrderActor;
  orderPublicId: string;
  targetStatus: OrderStatus;
  /** Optional documentation of the transition. */
  reason?: string;
}

export interface OrderTransitionReadModel {
  orderPublicId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
}

/**
 * Staff forward transition of the logistics lifecycle (RF-02): the entity
 * enforces the single path CONFIRMED -> PREPARING -> SHIPPED -> DELIVERED and
 * freezes a cash-on-delivery payment as PAID when the order reaches DELIVERED.
 * No stock moves here (sales were already consumed at confirmation); the
 * state move, history and audit commit inside one transaction.
 */
export class TransitionOrderStatus {
  constructor(
    private readonly checkoutReads: CheckoutReadRepository,
    private readonly checkoutWrites: CheckoutWriteRepository,
    private readonly orderWrites: OrderWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    command: TransitionOrderStatusCommand,
  ): Promise<OrderTransitionReadModel> {
    const reason = optionalReason(command.reason);
    const occurredAt = this.clock.now().toISOString();

    const scope: TransactionScope<OrderTransitionReadModel> = async (exec) => {
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
      order.transitionStatus(command.targetStatus, occurredAt);
      const updated = order.toSnapshot();

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
            entityType: "OrderStatus",
            entityIdentifier: updated.publicId,
            action: AuditAction.UPDATE,
            previousValues: {
              orderStatus: snapshot.orderStatus,
              paymentStatus: snapshot.paymentStatus,
            },
            newValues: {
              orderStatus: updated.orderStatus,
              paymentStatus: updated.paymentStatus,
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
      };
    };

    return this.unitOfWork.run(scope);
  }
}

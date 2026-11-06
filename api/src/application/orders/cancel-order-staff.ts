import type {
  CheckoutReadRepository,
  CheckoutWriteRepository,
} from "../../domain/checkout/interfaces/repositories/checkout.repository.js";
import type { OrderWriteRepository } from "../../domain/orders/interfaces/repositories/order.repository.js";
import { Order } from "../../domain/checkout/entities/order.entity.js";
import { Role } from "../../domain/users/enums/role.enum.js";
import type { ReintegrateCancelledSale } from "../inventory/reintegrate-cancelled-sale.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { auditEntryForOrders } from "./shared/audit.js";
import type { OrderActor } from "./shared/dependencies.js";
import type { OrderCancellationReadModel } from "./cancel-own-order.js";

export interface CancelOrderByStaffCommand {
  /** Staff member performing the cancellation (guarded identity). */
  actor: OrderActor;
  orderPublicId: string;
  /** Mandatory documentation of the staff cancellation. */
  reason?: string;
}

/**
 * Staff cancellation of any order (RF-02). Same persistence flow as the
 * customer cancellation, but the entity accepts one state further
 * (PREPARING, beyond the customer window) and the reason is mandatory, as in
 * every staff-driven destructive decision.
 */
export class CancelOrderByStaff {
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
    command: CancelOrderByStaffCommand,
  ): Promise<OrderCancellationReadModel> {
    const reason = requireReasonForStaff(command.reason);
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
      // The guard middleware certifies the actor is staff (OPERADOR or
      // ADMINISTRADOR); both roles share the same cancellable set inside the
      // entity, so the concrete staff role contributes nothing and
      // Role.OPERADOR is used verbatim.
      const order = Order.restore(snapshot);
      order.cancel(Role.OPERADOR, occurredAt);
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
              decision: "STAFF_CANCEL",
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

/** A staff cancellation can never happen without a documented reason. */
function requireReasonForStaff(reason?: string): string {
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (trimmed.length === 0) {
    throw new BusinessRuleViolation(
      "Cancelling an order requires the documented reason",
      ErrorCode.REQUIRED_FIELD_MISSING,
      "reason",
      undefined,
    );
  }
  return trimmed;
}

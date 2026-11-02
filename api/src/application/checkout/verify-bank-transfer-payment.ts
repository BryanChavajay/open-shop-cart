import type {
  CheckoutReadRepository,
  CheckoutWriteRepository,
} from "../../domain/checkout/interfaces/repositories/checkout.repository.js";
import { Order } from "../../domain/checkout/entities/order.entity.js";
import { OrderStatus } from "../../domain/checkout/enums/order-status.enum.js";
import type { PaymentStatus } from "../../domain/checkout/enums/payment-status.enum.js";
import type { ReintegrateCancelledSale } from "../inventory/reintegrate-cancelled-sale.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { auditEntryForCheckout } from "./shared/audit.js";
import type { CheckoutActor } from "./shared/dependencies.js";

export interface VerifyBankTransferPaymentCommand {
  /** Operator performing the verification (guarded identity). */
  actor: CheckoutActor;
  orderPublicId: string;
  decision: "APPROVE" | "REJECT";
  /** Mandatory documentation when the evidence is rejected. */
  reason?: string;
}

export interface PaymentVerificationReadModel {
  orderPublicId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
}

/**
 * Operator verification of a bank transfer/deposit payment. The order row
 * (and its payment) is locked first; the entity enforces that only a
 * PENDING_PAYMENT_VERIFICATION order with a PENDING_VERIFICATION payment
 * accepts a decision:
 *
 *   - APPROVE: order -> CONFIRMED, payment -> PAID.
 *   - REJECT:  order -> CANCELLED, payment -> REJECTED, and every sold unit
 *     (not yet returned) is reintegrated to the stock with its
 *     SALE_CANCELLATION kardex movement inside the same transaction.
 *
 * The state move and the history/audit records commit together; the order
 * and its payment always move atomically.
 */
export class VerifyBankTransferPayment {
  constructor(
    private readonly checkoutReads: CheckoutReadRepository,
    private readonly checkoutWrites: CheckoutWriteRepository,
    private readonly inventory: {
      reintegrateCancellation: ReintegrateCancelledSale;
    },
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly audit: AuditRepository,
  ) {}

  async execute(
    command: VerifyBankTransferPaymentCommand,
  ): Promise<PaymentVerificationReadModel> {
    const reason = requireReason(command.decision, command.reason);
    const occurredAt = this.clock.now().toISOString();

    const scope: TransactionScope<PaymentVerificationReadModel> = async (
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
      order.verifyPayment(command.decision, occurredAt);
      const updated = order.toSnapshot();

      let reintegratedUnits = 0;
      if (command.decision === "REJECT") {
        const lines = await this.checkoutReads.listOrderLines(
          exec,
          updated.publicId,
        );
        for (const line of lines) {
          const pending = line.quantity - line.quantityReturned;
          if (pending <= 0) {
            continue;
          }
          await this.inventory.reintegrateCancellation.execute({
            actor: { id: command.actor.id },
            relatedSalePublicId: updated.publicId,
            variantPublicId: line.variantPublicId,
            quantity: pending,
            joinExecutor: exec,
          });
          reintegratedUnits += pending;
        }
      }

      await this.checkoutWrites.applyPaymentVerification(exec, {
        orderId: updated.id!,
        orderStatus: updated.orderStatus,
        paymentStatus: updated.paymentStatus,
        verifiedByUserId: command.actor.id,
        reason,
        occurredAt,
        referenceNumber: null,
        providerData: null,
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
        auditEntryForCheckout(
          {
            entityType: "OrderPayment",
            entityIdentifier: updated.publicId,
            action: AuditAction.UPDATE,
            previousValues: {
              orderStatus: snapshot.orderStatus,
              paymentStatus: snapshot.paymentStatus,
            },
            newValues: {
              orderStatus: updated.orderStatus,
              paymentStatus: updated.paymentStatus,
              decision: command.decision,
              reason,
              reintegratedUnits,
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

/** Orders can never carry a REJECT without a documented reason. */
function requireReason(
  decision: "APPROVE" | "REJECT",
  reason?: string,
): string | null {
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (decision === "REJECT" && trimmed.length === 0) {
    throw new BusinessRuleViolation(
      "Rejecting a payment requires the documented reason",
      ErrorCode.REQUIRED_FIELD_MISSING,
      "reason",
      undefined,
    );
  }
  return trimmed.length === 0 ? null : trimmed;
}

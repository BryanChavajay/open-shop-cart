import { OrderStatus } from "../enums/order-status.enum.js";
import { PaymentStatus } from "../enums/payment-status.enum.js";
import { PaymentMethod } from "../enums/payment-method.enum.js";
import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Complete state of an order, used to restore the entity from persistence. */
export interface OrderSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Human-readable order number (ORD-YYYYMMDD-XXXX), unique. */
  orderNumber: string;
  userId: number;
  /** Public id of the source delivery address (ownership held at creation). */
  addressOriginPublicId: string;
  /** Internal id of the inventory reservation consumed here; null when absent. */
  reservationId: number | null;
  /** Internal id of the redeemed coupon; null when no coupon was applied. */
  couponId: number | null;
  couponCode: string | null;

  // Frozen delivery snapshot at confirmation time.
  recipientFirstName: string;
  recipientLastName: string;
  deliveryPhone: string;
  deliveryDepartment: string;
  deliveryMunicipality: string;
  deliveryExactAddress: string;
  deliveryReference: string;

  // Frozen amounts (gross, IVA 12% included, quetzales, scale 2 as numbers).
  subtotalGross: number;
  discountTotal: number;
  shippingCost: number;
  totalNet: number;
  totalTax: number;
  totalPayable: number;

  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;

  createdAt: string;
  updatedAt: string;
}

/**
 * Order entity: guards the transitions this module implements. The checkout
 * creates the order through its persistence (SP_Pedidos_Crear); later
 * order-management transitions (PREPARING, SHIPPED...) live with the orders
 * module. Here only the operator payment verification is guarded, because it
 * belongs to the checkout/payment domain.
 */
export class Order {
  private constructor(private state: OrderSnapshot) {}

  static restore(snapshot: OrderSnapshot): Order {
    return new Order({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get userId(): number {
    return this.state.userId;
  }

  get orderStatus(): OrderStatus {
    return this.state.orderStatus;
  }

  get paymentStatus(): PaymentStatus {
    return this.state.paymentStatus;
  }

  get paymentMethod(): PaymentMethod {
    return this.state.paymentMethod;
  }

  get totalPayable(): number {
    return this.state.totalPayable;
  }

  /**
   * Merges the operator decision: APPROVE moves the transfer to
   * CONFIRMED/PAID; REJECT moves it to CANCELLED/REJECTED (the caller then
   * reintegrates the stock). Only a BANK_TRANSFER order that is still waiting
   * for an unverified payment can be verified, and only once: the states move
   * atomically while guarded.
   */
  verifyPayment(decision: "APPROVE" | "REJECT", occurredAt: string): void {
    if (this.state.orderStatus !== OrderStatus.PENDING_PAYMENT_VERIFICATION) {
      throw new BusinessRuleViolation(
        "The order is not waiting for a payment verification",
        ErrorCode.INVALID_ORDER_STATE,
        undefined,
        undefined,
      );
    }
    if (this.state.paymentStatus !== PaymentStatus.PENDING_VERIFICATION) {
      throw new BusinessRuleViolation(
        "The payment is not waiting for verification",
        ErrorCode.INVALID_ORDER_STATE,
        undefined,
        undefined,
      );
    }
    if (this.state.paymentMethod !== PaymentMethod.BANK_TRANSFER) {
      throw new BusinessRuleViolation(
        "Only bank transfer payments are verified by an operator",
        ErrorCode.INVALID_ORDER_STATE,
        undefined,
        undefined,
      );
    }
    if (decision === "APPROVE") {
      this.state.orderStatus = OrderStatus.CONFIRMED;
      this.state.paymentStatus = PaymentStatus.PAID;
    } else {
      this.state.orderStatus = OrderStatus.CANCELLED;
      this.state.paymentStatus = PaymentStatus.REJECTED;
    }
    this.state.updatedAt = occurredAt;
  }

  /** Read-only complete state, handed to the repository for persistence. */
  toSnapshot(): OrderSnapshot {
    return { ...this.state };
  }
}

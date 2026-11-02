import { OrderStatus } from "../enums/order-status.enum.js";
import { PaymentStatus } from "../enums/payment-status.enum.js";
import { PaymentMethod } from "../enums/payment-method.enum.js";
import { Role } from "../../users/enums/role.enum.js";
import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { NotFoundError } from "../../shared/errors/not-found.js";
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
 * creates the order through its persistence (SP_Pedidos_Crear); the same
 * entity also guards the order-management rules (ownership, forward
 * transitions, cancellation) used by the orders use cases, while the
 * operator payment verification belongs to the checkout/payment domain.
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

  get orderNumber(): string {
    return this.state.orderNumber;
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

  get createdAt(): string {
    return this.state.createdAt;
  }

  get updatedAt(): string {
    return this.state.updatedAt;
  }

  get totalPayable(): number {
    return this.state.totalPayable;
  }

  /** States a CLIENTE may cancel (before any dispatch preparation). */
  private static readonly CUSTOMER_CANCELLABLE: readonly OrderStatus[] = [
    OrderStatus.PENDING_PAYMENT_VERIFICATION,
    OrderStatus.CONFIRMED,
  ];
  /** States staff (OPERADOR/ADMINISTRADOR) may additionally cancel. */
  private static readonly STAFF_CANCELLABLE: readonly OrderStatus[] = [
    ...Order.CUSTOMER_CANCELLABLE,
    OrderStatus.PREPARING,
  ];
  /** Single forward path of the logistics lifecycle. */
  private static readonly FORWARD_TRANSITIONS = new Map<
    OrderStatus,
    OrderStatus
  >([
    [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
    [OrderStatus.PREPARING, OrderStatus.SHIPPED],
    [OrderStatus.SHIPPED, OrderStatus.DELIVERED],
  ]);

  /** Whether the given user is the owner of the order. */
  isOwnedBy(userId: number): boolean {
    return this.state.userId === userId;
  }

  /**
   * Ownership guard of RF-01: a foreign order answers "not found", never a
   * permission error, so the existence of other customers' orders is not
   * leaked.
   */
  assertOwnedBy(userId: number): void {
    if (!this.isOwnedBy(userId)) {
      throw new NotFoundError(
        "Order not found",
        ErrorCode.ORDER_NOT_FOUND,
        undefined,
        undefined,
      );
    }
  }

  /**
   * Moves the order along the unique forward path CONFIRMED → PREPARING →
   * SHIPPED → DELIVERED. Any other move (terminal states, going back,
   * PENDING_PAYMENT_VERIFICATION) is rejected. A cash-on-delivery order that
   * reaches DELIVERED confirms its pending payment as PAID.
   */
  transitionStatus(targetStatus: OrderStatus, occurredAt: string): void {
    if (
      Order.FORWARD_TRANSITIONS.get(this.state.orderStatus) !== targetStatus
    ) {
      throw new BusinessRuleViolation(
        "The order cannot transition to the requested state",
        ErrorCode.INVALID_ORDER_STATE,
        undefined,
        undefined,
      );
    }
    this.state.orderStatus = targetStatus;
    if (
      targetStatus === OrderStatus.DELIVERED &&
      this.state.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
      this.state.paymentStatus === PaymentStatus.PENDING_ON_DELIVERY
    ) {
      this.state.paymentStatus = PaymentStatus.PAID;
    }
    this.state.updatedAt = occurredAt;
  }

  /**
   * Cancels the order. CLIENTE may cancel while it is still awaiting payment
   * verification or merely confirmed; staff may also cancel during warehouse
   * preparation. Anything already shipped/delivered/cancelled stays intact.
   * A paid order is marked REFUNDED (reintegration is persistence work); an
   * uncollected one is marked REJECTED.
   */
  cancel(actorRole: Role, occurredAt: string): void {
    const cancellable =
      actorRole === Role.CLIENTE
        ? Order.CUSTOMER_CANCELLABLE
        : Order.STAFF_CANCELLABLE;
    if (!cancellable.includes(this.state.orderStatus)) {
      throw new BusinessRuleViolation(
        "The order cannot be cancelled in its current state",
        ErrorCode.ORDER_CANCELLATION_NOT_ALLOWED,
        undefined,
        undefined,
      );
    }
    if (this.state.paymentStatus === PaymentStatus.PAID) {
      this.state.paymentStatus = PaymentStatus.REFUNDED;
    } else if (
      this.state.paymentStatus === PaymentStatus.PENDING_VERIFICATION ||
      this.state.paymentStatus === PaymentStatus.PENDING_ON_DELIVERY
    ) {
      this.state.paymentStatus = PaymentStatus.REJECTED;
    }
    this.state.orderStatus = OrderStatus.CANCELLED;
    this.state.updatedAt = occurredAt;
  }

  /**
   * Guards line returns: only a DELIVERED order accepts customer returns;
   * anything else is a state violation.
   */
  assertReturnable(): void {
    if (this.state.orderStatus !== OrderStatus.DELIVERED) {
      throw new BusinessRuleViolation(
        "Only a delivered order accepts returns",
        ErrorCode.INVALID_ORDER_STATE,
        undefined,
        undefined,
      );
    }
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

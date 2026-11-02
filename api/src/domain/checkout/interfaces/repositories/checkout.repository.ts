import type { CommandExecutor } from "../../../shared/interfaces/providers/sql-executor.js";
import type { OrderStatus } from "../../enums/order-status.enum.js";
import type { PaymentMethod } from "../../enums/payment-method.enum.js";
import type { PaymentStatus } from "../../enums/payment-status.enum.js";
import type { OrderSnapshot } from "../../entities/order.entity.js";

/** One cart line of a quote request. */
export interface CheckoutLinePayload {
  variantPublicId: string;
  quantity: number;
}

/** Catalog data a quote needs, resolved by the database. */
export interface QuotedVariant {
  variantId: number;
  variantPublicId: string;
  sku: string;
  productName: string;
  variantName: string;
  /** Net (tax-free) unit price in quetzales. */
  netUnitPrice: number;
  productActive: boolean;
  variantActive: boolean;
  variantDeleted: boolean;
  physicalStock: number;
  categoryPublicId: string;
  categoryName: string;
  requestedQuantity: number;
}

/** Stored confirmation receipt of a customer. */
export interface CheckoutOperationRecord {
  fingerprint: string;
  orderId: number;
  orderPublicId: string;
}

/** One frozen line of a registered order. */
export interface OrderLineRow {
  linePublicId: string;
  variantPublicId: string;
  sku: string;
  productName: string;
  variantName: string;
  quantity: number;
  quantityReturned: number;
  unitPriceNet: number;
  unitPriceGross: number;
  subtotalGross: number;
  discountGross: number;
  totalGross: number;
}

/** Header + payment row of an order (idle fields null when no payment row). */
export interface OrderVerificationRow {
  id: number;
  publicId: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  subtotalGross: number;
  discountTotal: number;
  shippingCost: number;
  totalNet: number;
  totalTax: number;
  totalPayable: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
}

/** Completion of a checkout operation receipt. */
export interface SaveCheckoutOperationCommand {
  customerId: number;
  idempotencyKey: string;
  fingerprint: string;
  orderId: number;
}

/** Frozen order line ready for insertion. */
export interface NewOrderLineData {
  publicId: string;
  orderId: number;
  variantId: number;
  sku: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPriceNet: number;
  unitPriceGross: number;
  subtotalGross: number;
  discountGross: number;
  totalGross: number;
}

/** Payment record of the order. */
export interface NewPaymentData {
  publicId: string;
  orderId: number;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  bankName: string | null;
  referenceNumber: string | null;
  providerData: string | null;
}

/** Append-only order state transition. */
export interface OrderHistoryEntryData {
  orderId: number;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  userId: number;
  reason: string | null;
  occurredAt: string;
}

/** State moves of the verification (order + payment in one update). */
export interface ApplyPaymentVerificationCommand {
  orderId: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  verifiedByUserId: number;
  reason: string | null;
  occurredAt: string;
  referenceNumber: string | null;
  providerData: string | null;
}

/** Quote reads: quoting data and confirmation/idempotency lookups. */
export interface CheckoutReadRepository {
  /**
   * Resolves every cart line against the catalog (active flags, net price,
   * category, stock). Unknown variants are silently dropped: the use case
   * compares lengths and reports QUOTE errors.
   */
  quoteVariants(
    lines: readonly CheckoutLinePayload[],
  ): Promise<QuotedVariant[]>;
  /**
   * Stored confirmation receipt for a (customer, key) pair, serialized
   * against writers; returns the canonical fingerprint of the first attempt.
   */
  findOperation(
    customerId: number,
    idempotencyKey: string,
  ): Promise<CheckoutOperationRecord | null>;
  /**
   * Locked (UPDLOCK/ROWLOCK) header + payment read of one order for the
   * payment verification flow; null when the order does not exist.
   */
  findOrderForVerification(
    orderPublicId: string,
  ): Promise<OrderVerificationRow | null>;
  /**
   * Header + payment row of one order; the optional customer id restricts to
   * the owner (RF-01). Used by idempotent replays of the confirmation.
   */
  findOrderRow(
    executor: CommandExecutor,
    context: { orderPublicId: string; customerId: number },
  ): Promise<OrderVerificationRow | null>;
  /** Locked read of one complete order snapshot (verification flows). */
  findOrderSnapshotLocked(
    executor: CommandExecutor,
    orderPublicId: string,
  ): Promise<OrderSnapshot | null>;
  /** Frozen lines of one order, resolved by its public id. */
  listOrderLines(
    executor: CommandExecutor,
    orderPublicId: string,
  ): Promise<OrderLineRow[]>;
}

/** Writes of the checkout/orders module; all inside the caller transaction. */
export interface CheckoutWriteRepository {
  /** Persists the confirmation receipt (unique per customer + key). */
  saveOperation(
    executor: CommandExecutor,
    command: SaveCheckoutOperationCommand,
  ): Promise<void>;
  /** Inserts the order header; returns the internal id. */
  insertOrder(
    executor: CommandExecutor,
    snapshot: OrderSnapshot,
  ): Promise<number>;
  /** Inserts one frozen order line. */
  insertOrderLine(
    executor: CommandExecutor,
    line: NewOrderLineData,
  ): Promise<void>;
  /** Registers the payment record of the order. */
  insertPayment(
    executor: CommandExecutor,
    payment: NewPaymentData,
  ): Promise<void>;
  /** Appends one state-transition history entry. */
  appendOrderHistory(
    executor: CommandExecutor,
    entry: OrderHistoryEntryData,
  ): Promise<void>;
  /** Moves order + payment states after the operator verification. */
  applyPaymentVerification(
    executor: CommandExecutor,
    command: ApplyPaymentVerificationCommand,
  ): Promise<void>;
}

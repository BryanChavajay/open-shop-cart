import type { PaymentMethod } from "../enums/payment-method.enum.js";
import type { OrderStatus } from "../enums/order-status.enum.js";
import type { PaymentStatus } from "../enums/payment-status.enum.js";

/** Evidence the client supplies for a bank transfer/deposit. */
export interface BankTransferDetails {
  method: PaymentMethod.BANK_TRANSFER;
  /** Bank of origin (e.g. Banrural, Banco Industrial, BAC). */
  bankName: string;
  /** Receipt / transfer reference number the customer recorded. */
  referenceNumber: string;
}

/** Cash on delivery carries no client evidence. */
export interface CashOnDeliveryDetails {
  method: PaymentMethod.CASH_ON_DELIVERY;
}

/** Card charge evidence: a tokenized payment source (Stripe payment_method id or a sandbox token). */
export interface CardDetails {
  method: PaymentMethod.CARD;
  source: string;
}

/** Method-specific evidence travelling with the checkout confirmation. */
export type PaymentDetails =
  | BankTransferDetails
  | CashOnDeliveryDetails
  | CardDetails;

/** Everything a strategy needs to execute the charge and define initial states. */
export interface PaymentExecutionContext {
  /** Public id of the order being settled ((internal id is not visible here)). */
  orderPublicId: string;
  /** Gross total to charge, canonical scale-2 string ("d.dd"). */
  amountGross: string;
  /**
   * Unique idempotency key for the provider call (idiosyncratic per strategy;
   * Stripe uses it to dedupe PaymentIntents).
   */
  idempotencyKey: string;
  /** Client evidence; the use case already discriminated by method. */
  details: PaymentDetails;
}

/** Strategy outcome: the initial states frozen on the order and its payment. */
export interface PaymentExecutionResult {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  /** Receipt/boleta number or processor transaction id, null when none. */
  referenceNumber: string | null;
  /** Raw processor metadata (e.g. provider JSON), null when none. */
  providerData: string | null;
}

/** Strategy of one payment method (the checkout never branches on classes). */
export interface PaymentStrategy {
  readonly method: PaymentMethod;
  execute(context: PaymentExecutionContext): Promise<PaymentExecutionResult>;
}

/** Resolves the strategy behind each payment method. */
export interface PaymentStrategyRegistry {
  getStrategy(method: PaymentMethod): PaymentStrategy;
}

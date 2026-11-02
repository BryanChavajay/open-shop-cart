/** Lifecycle of the order payment, orthogonal to the order logistics state. */
export enum PaymentStatus {
  /** Waiting for an operator to verify the bank receipt. */
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
  /** To be collected in cash when the order is delivered. */
  PENDING_ON_DELIVERY = "PENDING_ON_DELIVERY",
  /** Charge confirmed (card captured or transfer verified). */
  PAID = "PAID",
  /** Verification refused the evidence; the order was cancelled. */
  REJECTED = "REJECTED",
  /** Funds returned to the customer after a cancellation. */
  REFUNDED = "REFUNDED",
}

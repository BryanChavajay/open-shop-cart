/** Logistics lifecycle of an order created at checkout. */
export enum OrderStatus {
  /** Only for BANK_TRANSFER: waiting for the operator verification. */
  PENDING_PAYMENT_VERIFICATION = "PENDING_PAYMENT_VERIFICATION",
  /** Payment accepted (charged, COD confirmed, or transfer approved). */
  CONFIRMED = "CONFIRMED",
  /** Being prepared in the warehouse. */
  PREPARING = "PREPARING",
  /** Handed to the courier. */
  SHIPPED = "SHIPPED",
  /** Delivered to the customer. */
  DELIVERED = "DELIVERED",
  /** Cancelled before dispatch (operator rejected a transfer, or otherwise). */
  CANCELLED = "CANCELLED",
}

/** Lifecycle states of a stock reservation. */
export enum StockReservationStatus {
  /** Holding availability until it is consumed, released or expired. */
  ACTIVE = "ACTIVE",
  /** Fulfilled by a sale consumption. */
  CONSUMED = "CONSUMED",
  /** Manually released before expiry. */
  RELEASED = "RELEASED",
  /** Automatically expired after its deadline. */
  EXPIRED = "EXPIRED",
}

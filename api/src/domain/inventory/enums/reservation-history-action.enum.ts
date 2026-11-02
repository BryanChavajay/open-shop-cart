/** Actions recorded in the reservation history ledger. */
export enum ReservationHistoryAction {
  /** The reservation was created and is holding units. */
  CREATED = "CREATED",
  /** The reservation was manually released. */
  RELEASED = "RELEASED",
  /** The reservation was consumed by a sale. */
  CONSUMED = "CONSUMED",
  /** The reservation expired automatically (null/system user). */
  EXPIRED = "EXPIRED",
}

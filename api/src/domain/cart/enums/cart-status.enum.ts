/** Lifecycle states of a guest cart. */
export enum CartStatus {
  /** Still receiving activity from the shopper. */
  ACTIVE = "ACTIVE",
  /** Deliberately cleared by the shopper before conversion. */
  EMPTIED = "EMPTIED",
  /** Converted into an order by the checkout flow. */
  CONVERTED = "CONVERTED",
}

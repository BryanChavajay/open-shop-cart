/** Types of stock movements recorded in the kardex. */
export enum StockMovementType {
  /** Units received from a purchase. */
  PURCHASE_RECEIPT = "PURCHASE_RECEIPT",
  /** Units sold and dispatched. */
  SALE = "SALE",
  /** Signed correction applied manually by an operator. */
  MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT",
  /** Units reintegrated because a customer returned the product. */
  CUSTOMER_RETURN = "CUSTOMER_RETURN",
  /** Units reintegrated because the original sale was cancelled. */
  SALE_CANCELLATION = "SALE_CANCELLATION",
}

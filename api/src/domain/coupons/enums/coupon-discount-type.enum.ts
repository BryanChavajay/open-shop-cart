/** How the coupon reduces the payable amount. */
export enum CouponDiscountType {
  /** Percentage of the eligible subtotal. */
  PERCENTAGE = "PERCENTAGE",
  /** Flat amount in currency units. */
  FIXED_AMOUNT = "FIXED_AMOUNT",
}

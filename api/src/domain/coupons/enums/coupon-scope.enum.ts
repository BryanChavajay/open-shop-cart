/** Set of cart items a coupon can reduce. */
export enum CouponScope {
  /** Applies to the whole cart. */
  CART = "CART",
  /** Applies only to items of one category. */
  CATEGORY = "CATEGORY",
}

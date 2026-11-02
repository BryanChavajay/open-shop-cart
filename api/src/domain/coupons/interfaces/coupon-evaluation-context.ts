/** One cart line the coupon evaluation may reduce. */
export interface DiscountableLineItem {
  /** Public identifier of the cart line. */
  readonly linePublicId: string;
  /** Public identifier of the product variant sold in this line. */
  readonly variantPublicId: string;
  /** Public identifier of the category the variant belongs to. */
  readonly categoryPublicId: string;
  readonly quantity: number;
  /** Unit price in currency units, IVA included, as a 2-decimal string. */
  readonly unitPriceGross: string;
  /** Line subtotal (quantity * unit price) as a 2-decimal string, IVA included. */
  readonly subtotalGross: string;
}

/**
 * Frozen input of a coupon evaluation. The use case builds it from the cart
 * and repository data so the entity stays pure: it never reads persistence
 * and the evaluation result is reproducible.
 */
export interface CouponEvaluationContext {
  readonly customerId: number;
  /** Times this customer already redeemed the coupon. */
  readonly customerUsageCount: number;
  /** Coupons already applied to the cart; stacking is not allowed. */
  readonly alreadyAppliedCouponCount: number;
  /** Instant the evaluation runs against (validity window and limits). */
  readonly evaluatedAt: Date;
  readonly items: readonly DiscountableLineItem[];
}

/** Discount assigned to a single cart line as a 2-decimal string, IVA included. */
export interface LineDiscountAllocation {
  readonly linePublicId: string;
  readonly variantPublicId: string;
  readonly originalSubtotalGross: string;
  readonly discountGross: string;
  readonly finalSubtotalGross: string;
}

/** Outcome of applying one coupon to an evaluation context. */
export interface CouponApplicationResult {
  readonly couponPublicId: string;
  readonly code: string;
  /** Whole cart subtotal as a 2-decimal string, IVA included. */
  readonly cartSubtotalGross: string;
  /** Subtotal of the items eligible for the coupon as a 2-decimal string. */
  readonly eligibleSubtotalGross: string;
  /** Total discount as a 2-decimal string, IVA included. */
  readonly discountGross: string;
  /** Total after the discount as a 2-decimal string, IVA included. */
  readonly finalTotalGross: string;
  readonly lineAllocations: readonly LineDiscountAllocation[];
}

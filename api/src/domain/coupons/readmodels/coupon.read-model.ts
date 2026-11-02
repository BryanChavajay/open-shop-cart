import type { CouponDiscountType } from "../enums/coupon-discount-type.enum.js";
import type { CouponScope } from "../enums/coupon-scope.enum.js";

/** Element of the administrative listing of coupons. */
export interface CouponListItem {
  readonly publicId: string;
  /** Normalized (uppercase). */
  readonly code: string;
  readonly discountType: CouponDiscountType;
  readonly discountValue: number;
  readonly scope: CouponScope;
  readonly categoryPublicId: string | null;
  /** Name of the target category; null for CART scope. */
  readonly categoryName: string | null;
  readonly minPurchaseAmount: number;
  readonly maxTotalUses: number;
  readonly maxUsesPerCustomer: number;
  readonly usedCount: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isActive: boolean;
  readonly createdAt: string;
}

/** Full representation of one coupon. */
export interface CouponDetail extends CouponListItem {
  readonly updatedAt: string;
}

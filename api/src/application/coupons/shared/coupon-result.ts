import type {
  CouponApplicationResult,
  DiscountableLineItem,
  LineDiscountAllocation,
} from "../../../domain/coupons/interfaces/coupon-evaluation-context.js";
import type { Coupon } from "../../../domain/coupons/entities/coupon.entity.js";

/**
 * Formats an amount with exactly two decimals (half-up, no significant float
 * drift for typical scale-2 inputs). Presentation validates the raw input.
 */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2);
}

/**
 * Sums amounts given as 2-decimal strings. Every addend is already an exact
 * scale-2 value, so the binary-float accumulation error stays far below one
 * cent for realistic cart sizes; the final re-rounding through formatAmount
 * keeps the displayed total exact.
 */
export function sumAmounts(parts: readonly string[]): string {
  let total = 0;
  for (const part of parts) {
    total += Number(part);
  }
  return formatAmount(total);
}

/**
 * Assembles the read-model result of a coupon evaluation from the entity
 * state, the original items, the eligible filtering and the per-line
 * allocations. The subtotals are recomputed by summation (not by trusting a
 * single source) so the arithmetic contract of `CouponApplicationResult`
 * (finalTotal = cartSubtotal - discount) holds exactly.
 *
 * Note: exact-cents arithmetic happens per line inside the infrastructure
 * strategies; this aggregation is limited to sums of scale-2 numbers.
 */
export function buildCouponApplicationResult(
  coupon: Coupon,
  items: readonly DiscountableLineItem[],
  eligible: readonly DiscountableLineItem[],
  allocations: readonly LineDiscountAllocation[],
): CouponApplicationResult {
  const cartSubtotalGross = sumAmounts(items.map((item) => item.subtotalGross));
  const eligibleSubtotalGross = sumAmounts(
    eligible.map((item) => item.subtotalGross),
  );
  const discountGross = sumAmounts(
    allocations.map((allocation) => allocation.discountGross),
  );
  const finalTotalGross = formatAmount(
    Number(cartSubtotalGross) - Number(discountGross),
  );

  return {
    couponPublicId: coupon.publicId,
    code: coupon.code,
    cartSubtotalGross,
    eligibleSubtotalGross,
    discountGross,
    finalTotalGross,
    lineAllocations: allocations,
  };
}

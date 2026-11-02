import { CouponDiscountType } from "../../../domain/coupons/enums/coupon-discount-type.enum.js";
import type { DiscountCalculationStrategy } from "../../../domain/coupons/interfaces/discount-strategy.js";
import type {
  DiscountableLineItem,
  LineDiscountAllocation,
} from "../../../domain/coupons/interfaces/coupon-evaluation-context.js";
import { formatScaled, parseAmount } from "../money-math.js";

/** Sign-aware floor of `value / divisor` (rounds toward zero by magnitude). */
function divideFloor(value: bigint, divisor: bigint): bigint {
  const magnitude = value >= 0n ? value : -value;
  const floored = magnitude / divisor;
  return value >= 0n ? floored : -floored;
}

/**
 * Fixed-amount discount strategy.
 *
 * `discountValue` is a 2-decimal string amount ("25.00"). The applied amount
 * is capped at the eligible subtotal (`effective = min(fixed, subtotal)`) so
 * totals can never go negative. It is then distributed proportionally to each
 * line's subtotal with floor division, and the remainder cents are handed out
 * one by one LAST-to-FIRST (deterministic: the last eligible line gets the
 * first extra cent), so the allocation sum equals the effective amount exactly.
 *
 * A line never ends up discounted over its own subtotal: only an `effective`
 * equal to the eligible subtotal reaches a line's full share, and that case is
 * exact division (no remainder to redistribute). The sum of allocations caps
 * at the eligible subtotal, so every `finalSubtotal` stays non-negative.
 */
export class FixedAmountDiscountStrategy implements DiscountCalculationStrategy {
  readonly type: CouponDiscountType = CouponDiscountType.FIXED_AMOUNT;

  calculate(
    discountValue: string,
    eligibleItems: readonly DiscountableLineItem[],
  ): readonly LineDiscountAllocation[] {
    const subtotals = eligibleItems.map((item) => parseAmount(item.subtotalGross));
    const eligibleSubtotal = subtotals.reduce((total, line) => total + line, 0n);
    // Guard: entity validation rejects empty eligibility, but division by zero
    // must be impossible regardless of the caller.
    if (eligibleSubtotal === 0n) {
      return [];
    }
    const fixed = parseAmount(discountValue);
    const effective = fixed > eligibleSubtotal ? eligibleSubtotal : fixed;
    const shares = subtotals.map((line) => divideFloor(effective * line, eligibleSubtotal));
    let remaining = effective - shares.reduce((total, share) => total + share, 0n);
    // The remainder is smaller than the item count (each share loses strictly
    // less than one cent); the wrap-around keeps the loop safe regardless.
    let cursor = shares.length - 1;
    while (remaining > 0n) {
      const current = shares[cursor] ?? 0n;
      shares[cursor] = current + 1n;
      remaining -= 1n;
      cursor = cursor === 0 ? shares.length - 1 : cursor - 1;
    }
    return eligibleItems.map((item, index): LineDiscountAllocation => {
      const subtotalScaled = subtotals[index] ?? 0n;
      const discountScaled = shares[index] ?? 0n;
      const finalScaled = subtotalScaled - discountScaled;
      return {
        linePublicId: item.linePublicId,
        variantPublicId: item.variantPublicId,
        originalSubtotalGross: formatScaled(subtotalScaled),
        discountGross: formatScaled(discountScaled),
        finalSubtotalGross: formatScaled(finalScaled),
      };
    });
  }
}

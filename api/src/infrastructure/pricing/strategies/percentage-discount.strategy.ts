import { CouponDiscountType } from "../../../domain/coupons/enums/coupon-discount-type.enum.js";
import type { DiscountCalculationStrategy } from "../../../domain/coupons/interfaces/discount-strategy.js";
import type {
  DiscountableLineItem,
  LineDiscountAllocation,
} from "../../../domain/coupons/interfaces/coupon-evaluation-context.js";
import {
  divideHalfUp,
  formatScaled,
  parseAmount,
  PERCENT_DENOMINATOR,
  PERCENT_DENOMINATOR_HALF,
} from "../money-math.js";

/**
 * Percentage discount strategy.
 *
 * `discountValue` is a decimal string percent ("10.5" meaning 10.5%). For each
 * eligible line: `discountScaled = divideHalfUp(subtotalScaled * valueBasis,
 * 10000, 5000)`, where both operands are scale-2 BigInts, so percent applied
 * over an amount cancels through the 10000 factor back to scale-2. The
 * discount is capped at the line subtotal defensively.
 */
export class PercentageDiscountStrategy implements DiscountCalculationStrategy {
  readonly type: CouponDiscountType = CouponDiscountType.PERCENTAGE;

  calculate(
    discountValue: string,
    eligibleItems: readonly DiscountableLineItem[],
  ): readonly LineDiscountAllocation[] {
    const valueBasis = parseAmount(discountValue);
    return eligibleItems.map((item): LineDiscountAllocation => {
      const subtotalScaled = parseAmount(item.subtotalGross);
      let discountScaled = divideHalfUp(
        subtotalScaled * valueBasis,
        PERCENT_DENOMINATOR,
        PERCENT_DENOMINATOR_HALF,
      );
      if (discountScaled > subtotalScaled) {
        discountScaled = subtotalScaled;
      }
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

import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { CouponDiscountType } from "../../domain/coupons/enums/coupon-discount-type.enum.js";
import type {
  DiscountCalculationStrategy,
  DiscountStrategyRegistry,
} from "../../domain/coupons/interfaces/discount-strategy.js";
import { FixedAmountDiscountStrategy } from "./strategies/fixed-amount-discount.strategy.js";
import { PercentageDiscountStrategy } from "./strategies/percentage-discount.strategy.js";

/**
 * Registry of discount calculation strategies. Holds one shared instance per
 * strategy (both are stateless, so a single instance serves every call) and
 * resolves them by discount type.
 */
export class DefaultDiscountStrategyRegistry implements DiscountStrategyRegistry {
  private readonly percentage: DiscountCalculationStrategy = new PercentageDiscountStrategy();
  private readonly fixedAmount: DiscountCalculationStrategy = new FixedAmountDiscountStrategy();

  getStrategy(type: CouponDiscountType): DiscountCalculationStrategy {
    switch (type) {
      case CouponDiscountType.PERCENTAGE:
        return this.percentage;
      case CouponDiscountType.FIXED_AMOUNT:
        return this.fixedAmount;
      default: {
        // Exhaustiveness guard: adding an enum member without a strategy here
        // fails to compile.
        const unhandledType: never = type;
        throw new BusinessRuleViolation(
          `There is no discount strategy registered for "${String(unhandledType)}"`,
          ErrorCode.INVALID_COUPON_STATE,
          undefined,
          undefined,
        );
      }
    }
  }
}

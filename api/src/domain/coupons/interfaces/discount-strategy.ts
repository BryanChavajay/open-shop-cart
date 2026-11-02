import type { CouponDiscountType } from "../enums/coupon-discount-type.enum.js";
import type {
  DiscountableLineItem,
  LineDiscountAllocation,
} from "./coupon-evaluation-context.js";

/**
 * Strategy resolved by a registry; computes allocations for eligible lines.
 * Exact 2-decimal math is the implementation's duty.
 */
export interface DiscountCalculationStrategy {
  /** Discount type the strategy is registered under. */
  readonly type: CouponDiscountType;
  /** Semantics of `discountValue` are defined by each implementation. */
  calculate(
    discountValue: string,
    eligibleItems: readonly DiscountableLineItem[],
  ): readonly LineDiscountAllocation[];
}

/** Resolves the calculation strategy behind each discount type. */
export interface DiscountStrategyRegistry {
  getStrategy(type: CouponDiscountType): DiscountCalculationStrategy;
}

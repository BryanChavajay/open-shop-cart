import { Coupon } from "../../domain/coupons/entities/coupon.entity.js";
import type { CouponReadRepository } from "../../domain/coupons/interfaces/repositories/coupon.repository.js";
import type {
  DiscountableLineItem,
  CouponApplicationResult,
  CouponEvaluationContext,
} from "../../domain/coupons/interfaces/coupon-evaluation-context.js";
import type { DiscountStrategyRegistry } from "../../domain/coupons/interfaces/discount-strategy.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import {
  buildCouponApplicationResult,
  formatAmount,
} from "./shared/coupon-result.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface EvaluateCouponCommand {
  /** Redeeming customer; the per-customer usage limit is checked against it. */
  customerId: number;
  /** Coupon code as typed by the customer; persistence matches it uppercase. */
  code: string;
  items: readonly DiscountableLineItem[];
  /** Coupons already applied to the cart; stacking is not allowed. */
  alreadyAppliedCouponCount: number;
  /**
   * Instant the evaluation runs against. Defaults to the injected clock's
   * current instant, avoiding direct `new Date()` calls in the application
   * layer and keeping evaluations deterministically testable.
   */
  evaluatedAt?: Date | undefined;
}

/**
 * Discount-only evaluation of a coupon against a set of cart lines (no
 * transaction, no writes, no redemption record: a preview of what redeeming
 * would produce). The existence check and the customer usage count use
 * non-locked reads; the authoritative race-safe enforcement happens in
 * RedeemCoupon.
 *
 * Business conditions (stacking, vigency, limits, minimum purchase, scope
 * applicability) are enforced by the entity, which throws the specific
 * COUPON_* error codes; they propagate untouched from here.
 *
 * Totals are assembled by summation of the exact 2-decimal line values; the
 * per-line arithmetic precision lives inside the infrastructure strategies.
 */
export class EvaluateCoupon {
  constructor(
    private readonly reads: CouponReadRepository,
    private readonly clock: Clock,
    private readonly registry: DiscountStrategyRegistry,
  ) {}

  async execute(
    command: EvaluateCouponCommand,
  ): Promise<CouponApplicationResult> {
    requireValidCustomerId(command.customerId);
    const code = requireNonEmptyCode(command.code);
    const evaluatedAt = command.evaluatedAt ?? this.clock.now();

    const snapshot = await this.reads.findCouponByCode(code);
    if (snapshot === null) {
      throw new NotFoundError(
        "Coupon not found",
        ErrorCode.COUPON_NOT_FOUND,
        undefined,
        undefined,
      );
    }
    const coupon = Coupon.restore(snapshot);

    const context: CouponEvaluationContext = {
      customerId: command.customerId,
      customerUsageCount: await this.reads.countCustomerUses(
        requireInternalId(coupon.id),
        command.customerId,
      ),
      alreadyAppliedCouponCount: command.alreadyAppliedCouponCount,
      evaluatedAt,
      items: command.items,
    };
    const eligible = coupon.validateAndFilterEligibleItems(context);

    // The discount value travels to the strategy as an exact 2-decimal
    // string, the convention of DiscountCalculationStrategy.calculate.
    const strategy = this.registry.getStrategy(coupon.discountType);
    const allocations = strategy.calculate(
      formatAmount(coupon.discountValue),
      eligible,
    );

    return buildCouponApplicationResult(
      coupon,
      command.items,
      eligible,
      allocations,
    );
  }
}

/** Input guards shared with RedeemCoupon. */
function requireValidCustomerId(customerId: number): void {
  if (!Number.isSafeInteger(customerId) || customerId < 1) {
    throw new BusinessRuleViolation(
      "The field customerId must be an integer greater than zero",
      ErrorCode.INVALID_INPUT,
      "customerId",
      undefined,
    );
  }
}

function requireNonEmptyCode(code: string): string {
  const normalized = code.trim();
  if (normalized.length === 0) {
    throw new BusinessRuleViolation(
      "The required field code was not provided",
      ErrorCode.REQUIRED_FIELD_MISSING,
      "code",
      undefined,
    );
  }
  return normalized;
}

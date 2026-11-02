import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import { CouponDiscountType } from "../enums/coupon-discount-type.enum.js";
import { CouponScope } from "../enums/coupon-scope.enum.js";
import type {
  CouponEvaluationContext,
  DiscountableLineItem,
} from "../interfaces/coupon-evaluation-context.js";

/** Maximum accepted length for a coupon code. */
const CODE_MAX_LENGTH = 64;

/** Complete state of a coupon, used to restore the entity from persistence. */
export interface CouponSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Normalized (uppercase). Unique among non-deleted coupons. */
  code: string;
  discountType: CouponDiscountType;
  /**
   * For PERCENTAGE: percent value in the interval (0, 100]. For FIXED_AMOUNT:
   * amount in currency units. Money math uses 2-decimal strings elsewhere;
   * here it is a number for snapshot parity with the other entities.
   */
  discountValue: number;
  scope: CouponScope;
  /** Public id of the target category for CATEGORY scope; null for CART. */
  categoryPublicId: string | null;
  /** Internal id of the target category, kept for repository writes; null for CART. */
  categoryId: number | null;
  minPurchaseAmount: number;
  maxTotalUses: number;
  maxUsesPerCustomer: number;
  usedCount: number;
  /** ISO UTC instant the coupon becomes redeemable. */
  startsAt: string;
  /** ISO UTC instant the coupon stops being redeemable. */
  endsAt: string;
  isActive: boolean;
  isDeleted: boolean;
}

/** Data required to create a new coupon. */
export interface NewCouponData {
  publicId: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  categoryPublicId: string | null;
  categoryId: number | null;
  minPurchaseAmount: number;
  maxTotalUses: number;
  maxUsesPerCustomer: number;
  startsAt: string;
  endsAt: string;
  /** Activation is decided by the use case. */
  isActive: boolean;
}

/** Data that can be changed on an existing coupon. */
export interface UpdateCouponData {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  categoryPublicId: string | null;
  categoryId: number | null;
  minPurchaseAmount: number;
  maxTotalUses: number;
  maxUsesPerCustomer: number;
  startsAt: string;
  endsAt: string;
}

/**
 * Coupon entity. Every modification goes through methods that enforce business
 * rules. The discount math over cart lines happens in the infrastructure
 * strategies; the entity only validates and filters eligibility.
 */
export class Coupon {
  private state: CouponSnapshot;

  private constructor(state: CouponSnapshot) {
    this.state = state;
  }

  /** Creates a new coupon (not persisted yet). */
  static create(data: NewCouponData): Coupon {
    return new Coupon({
      id: null,
      publicId: data.publicId,
      code: Coupon.requireCode(data.code),
      discountType: data.discountType,
      discountValue: Coupon.requireDiscountValue(
        data.discountValue,
        data.discountType,
      ),
      ...Coupon.requireScopeCoherence(
        data.scope,
        data.categoryPublicId,
        data.categoryId,
      ),
      minPurchaseAmount: Coupon.requireMinPurchase(data.minPurchaseAmount),
      ...Coupon.requireLimits(data.maxTotalUses, data.maxUsesPerCustomer),
      usedCount: 0,
      ...Coupon.requireVigency(data.startsAt, data.endsAt),
      isActive: data.isActive,
      isDeleted: false,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: CouponSnapshot): Coupon {
    return new Coupon({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get code(): string {
    return this.state.code;
  }

  get discountType(): CouponDiscountType {
    return this.state.discountType;
  }

  get discountValue(): number {
    return this.state.discountValue;
  }

  get scope(): CouponScope {
    return this.state.scope;
  }

  get categoryPublicId(): string | null {
    return this.state.categoryPublicId;
  }

  get categoryId(): number | null {
    return this.state.categoryId;
  }

  get minPurchaseAmount(): number {
    return this.state.minPurchaseAmount;
  }

  get maxTotalUses(): number {
    return this.state.maxTotalUses;
  }

  get maxUsesPerCustomer(): number {
    return this.state.maxUsesPerCustomer;
  }

  get usedCount(): number {
    return this.state.usedCount;
  }

  get startsAt(): string {
    return this.state.startsAt;
  }

  get endsAt(): string {
    return this.state.endsAt;
  }

  get isActive(): boolean {
    return this.state.isActive;
  }

  get isDeleted(): boolean {
    return this.state.isDeleted;
  }

  /**
   * Replaces the mutable commercial data, keeping usedCount. Integrity guards
   * that span persistence (not reducing maxTotalUses below the usedCount, nor
   * maxUsesPerCustomer below a customer's per-customer count) are performed by
   * the use case with repository data before calling this method.
   */
  update(data: UpdateCouponData): void {
    this.assertNotDeleted();
    this.state.code = Coupon.requireCode(data.code);
    this.state.discountType = data.discountType;
    this.state.discountValue = Coupon.requireDiscountValue(
      data.discountValue,
      data.discountType,
    );
    Object.assign(
      this.state,
      Coupon.requireScopeCoherence(
        data.scope,
        data.categoryPublicId,
        data.categoryId,
      ),
    );
    this.state.minPurchaseAmount = Coupon.requireMinPurchase(
      data.minPurchaseAmount,
    );
    Object.assign(
      this.state,
      Coupon.requireLimits(data.maxTotalUses, data.maxUsesPerCustomer),
    );
    Object.assign(
      this.state,
      Coupon.requireVigency(data.startsAt, data.endsAt),
    );
  }

  /** Activates the coupon. */
  activate(): void {
    this.assertNotDeleted();
    this.state.isActive = true;
  }

  /** Deactivates the coupon without removing it. */
  deactivate(): void {
    this.assertNotDeleted();
    this.state.isActive = false;
  }

  /** Soft delete: marks it as deleted and also deactivates it. The code is released. */
  markDeleted(): void {
    this.assertNotDeleted();
    this.state.isDeleted = true;
    this.state.isActive = false;
  }

  /** Copy of the current state. */
  toSnapshot(): CouponSnapshot {
    return { ...this.state };
  }

  /** The coupon observes the instant: active, not deleted and inside the window. */
  isEligibleAt(instant: Date): boolean {
    if (this.state.isDeleted || !this.state.isActive) {
      return false;
    }
    const startsAt = Date.parse(this.state.startsAt);
    const endsAt = Date.parse(this.state.endsAt);
    const evaluated = instant.getTime();
    return startsAt <= evaluated && evaluated <= endsAt;
  }

  /**
   * Pure evaluation. Checks the global conditions (stacking, vigency, usage
   * limits and minimum purchase) and returns the items the coupon applies to,
   * in the same order they arrive. Throws the specific business errors.
   */
  validateAndFilterEligibleItems(
    context: CouponEvaluationContext,
  ): readonly DiscountableLineItem[] {
    this.assertRedeemable(context);
    const items = this.filterItems(context);
    const eligibleSubtotal = Coupon.sumSubtotals(items);
    if (
      this.state.minPurchaseAmount !== 0 &&
      eligibleSubtotal < this.state.minPurchaseAmount
    ) {
      throw new BusinessRuleViolation(
        "The eligible subtotal does not reach the coupon minimum purchase",
        ErrorCode.COUPON_MIN_PURCHASE_NOT_MET,
        undefined,
        undefined,
      );
    }
    return items;
  }

  /**
   * Re-runs every condition that does not depend on the cart items, throwing
   * the same specific errors as validateAndFilterEligibleItems.
   */
  assertRedeemable(context: CouponEvaluationContext): void {
    if (context.alreadyAppliedCouponCount > 0) {
      throw new BusinessRuleViolation(
        "Another coupon is already applied; stacked coupons are not allowed",
        ErrorCode.MULTIPLE_COUPONS_NOT_ALLOWED,
        undefined,
        undefined,
      );
    }
    if (!this.isEligibleAt(context.evaluatedAt)) {
      throw new BusinessRuleViolation(
        "The coupon is inactive or outside its validity window",
        ErrorCode.COUPON_INACTIVE_OR_EXPIRED,
        undefined,
        undefined,
      );
    }
    if (this.state.usedCount >= this.state.maxTotalUses) {
      throw new BusinessRuleViolation(
        "The coupon reached its total usage limit",
        ErrorCode.COUPON_USAGE_LIMIT_EXHAUSTED,
        undefined,
        undefined,
      );
    }
    if (context.customerUsageCount >= this.state.maxUsesPerCustomer) {
      throw new BusinessRuleViolation(
        "The customer reached the coupon usage limit",
        ErrorCode.COUPON_CUSTOMER_LIMIT_EXHAUSTED,
        undefined,
        undefined,
      );
    }
  }

  /** Counts one redemption after assertRedeemable succeeded. */
  redeem(context: CouponEvaluationContext): void {
    this.assertRedeemable(context);
    this.state.usedCount += 1;
  }

  private filterItems(
    context: CouponEvaluationContext,
  ): readonly DiscountableLineItem[] {
    if (this.state.scope === CouponScope.CATEGORY) {
      const items = context.items.filter(
        (item) => item.categoryPublicId === this.state.categoryPublicId,
      );
      if (items.length === 0) {
        throw new BusinessRuleViolation(
          "No cart item belongs to the category purchased by the coupon",
          ErrorCode.COUPON_NOT_APPLICABLE_TO_ITEMS,
          undefined,
          undefined,
        );
      }
      return items;
    }
    if (context.items.length === 0) {
      throw new BusinessRuleViolation(
        "There are no cart items to apply the coupon to",
        ErrorCode.COUPON_NOT_APPLICABLE_TO_ITEMS,
        undefined,
        undefined,
      );
    }
    return context.items;
  }

  private static sumSubtotals(items: readonly DiscountableLineItem[]): number {
    let subtotal = 0;
    for (const item of items) {
      subtotal += Number(item.subtotalGross);
    }
    return subtotal;
  }

  private assertNotDeleted(): void {
    if (this.state.isDeleted) {
      throw new BusinessRuleViolation(
        "The coupon was deleted",
        ErrorCode.INVALID_COUPON_STATE,
        undefined,
        undefined,
      );
    }
  }

  private static requireCode(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (normalized.length === 0) {
      throw new BusinessRuleViolation(
        "The required field code was not provided",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "code",
        undefined,
      );
    }
    if (normalized.length > CODE_MAX_LENGTH) {
      throw new BusinessRuleViolation(
        `The coupon code exceeds ${CODE_MAX_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        "code",
        undefined,
      );
    }
    return normalized;
  }

  private static requireDiscountValue(
    value: number,
    discountType: CouponDiscountType,
  ): number {
    if (!Number.isFinite(value) || value <= 0) {
      throw new BusinessRuleViolation(
        "The discount value must be greater than zero",
        ErrorCode.INVALID_INPUT,
        "discountValue",
        undefined,
      );
    }
    if (discountType === CouponDiscountType.PERCENTAGE && value > 100) {
      throw new BusinessRuleViolation(
        "The percentage discount cannot exceed 100",
        ErrorCode.INVALID_INPUT,
        "discountValue",
        undefined,
      );
    }
    return value;
  }

  private static requireScopeCoherence(
    scope: CouponScope,
    categoryPublicId: string | null,
    categoryId: number | null,
  ): Pick<CouponSnapshot, "scope" | "categoryPublicId" | "categoryId"> {
    if (scope === CouponScope.CART) {
      if (categoryPublicId !== null || categoryId !== null) {
        throw new BusinessRuleViolation(
          "A cart-scope coupon cannot point to a category",
          ErrorCode.INVALID_INPUT,
          "categoryPublicId",
          undefined,
        );
      }
      return { scope, categoryPublicId: null, categoryId: null };
    }
    const normalizedCategoryPublicId =
      categoryPublicId === null ? "" : categoryPublicId.trim();
    if (normalizedCategoryPublicId.length === 0) {
      throw new BusinessRuleViolation(
        "The required field categoryPublicId was not provided",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "categoryPublicId",
        undefined,
      );
    }
    if (
      !Number.isInteger(categoryId) ||
      categoryId === null ||
      categoryId < 1
    ) {
      throw new BusinessRuleViolation(
        "The field categoryId must be an integer greater than zero",
        ErrorCode.INVALID_INPUT,
        "categoryId",
        undefined,
      );
    }
    return { scope, categoryPublicId: normalizedCategoryPublicId, categoryId };
  }

  private static requireMinPurchase(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
      throw new BusinessRuleViolation(
        "The minimum purchase amount must be greater than or equal to zero",
        ErrorCode.INVALID_INPUT,
        "minPurchaseAmount",
        undefined,
      );
    }
    return value;
  }

  private static requireLimits(
    maxTotalUses: number,
    maxUsesPerCustomer: number,
  ): Pick<CouponSnapshot, "maxTotalUses" | "maxUsesPerCustomer"> {
    if (!Number.isInteger(maxTotalUses) || maxTotalUses < 1) {
      throw new BusinessRuleViolation(
        "The field maxTotalUses must be an integer greater than zero",
        ErrorCode.INVALID_INPUT,
        "maxTotalUses",
        undefined,
      );
    }
    if (!Number.isInteger(maxUsesPerCustomer) || maxUsesPerCustomer < 1) {
      throw new BusinessRuleViolation(
        "The field maxUsesPerCustomer must be an integer greater than zero",
        ErrorCode.INVALID_INPUT,
        "maxUsesPerCustomer",
        undefined,
      );
    }
    if (maxUsesPerCustomer > maxTotalUses) {
      throw new BusinessRuleViolation(
        "The per-customer limit cannot exceed the total usage limit",
        ErrorCode.INVALID_INPUT,
        "maxUsesPerCustomer",
        undefined,
      );
    }
    return { maxTotalUses, maxUsesPerCustomer };
  }

  private static requireVigency(
    startsAt: string,
    endsAt: string,
  ): Pick<CouponSnapshot, "startsAt" | "endsAt"> {
    const start = Date.parse(startsAt);
    const end = Date.parse(endsAt);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      throw new BusinessRuleViolation(
        "The validity window is not a valid date range",
        ErrorCode.INVALID_INPUT,
        "endsAt",
        undefined,
      );
    }
    return { startsAt, endsAt };
  }
}

import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Maximum accepted length for a sale reference. */
const SALE_REFERENCE_MAX_LENGTH = 100;

/** Complete state of a coupon redemption, used to restore it from persistence. */
export interface CouponRedemptionSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Internal identifier of the redeemed coupon. */
  couponId: number;
  /** Internal identifier of the redeeming user. */
  userId: number;
  /** Business reference of the sale where the discount was applied. */
  saleReference: string;
  /** Discount actually applied, in currency units. */
  discountAmount: number;
  /** ISO UTC instant of the redemption. */
  usedAt: string;
}

/** Data required to create a new coupon redemption. */
export interface NewCouponRedemptionData {
  publicId: string;
  couponId: number;
  userId: number;
  saleReference: string;
  discountAmount: number;
  usedAt: string;
}

/**
 * Coupon redemption entity (audit aggregate of one use). It is immutable after
 * creation: no mutation methods are exposed.
 */
export class CouponRedemption {
  private state: CouponRedemptionSnapshot;

  private constructor(state: CouponRedemptionSnapshot) {
    this.state = state;
  }

  /** Creates a new redemption (not persisted yet). */
  static create(data: NewCouponRedemptionData): CouponRedemption {
    return new CouponRedemption({
      id: null,
      publicId: CouponRedemption.requirePublicId(data.publicId),
      couponId: CouponRedemption.requirePositiveInteger(
        data.couponId,
        "couponId",
      ),
      userId: CouponRedemption.requirePositiveInteger(data.userId, "userId"),
      saleReference: CouponRedemption.requireSaleReference(data.saleReference),
      discountAmount: CouponRedemption.requireDiscountAmount(
        data.discountAmount,
      ),
      usedAt: data.usedAt,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: CouponRedemptionSnapshot): CouponRedemption {
    return new CouponRedemption({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get couponId(): number {
    return this.state.couponId;
  }

  get userId(): number {
    return this.state.userId;
  }

  get saleReference(): string {
    return this.state.saleReference;
  }

  get discountAmount(): number {
    return this.state.discountAmount;
  }

  get usedAt(): string {
    return this.state.usedAt;
  }

  /** Copy of the current state. */
  toSnapshot(): CouponRedemptionSnapshot {
    return { ...this.state };
  }

  private static requirePublicId(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleViolation(
        "The required field publicId was not provided",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "publicId",
        undefined,
      );
    }
    return trimmed;
  }

  private static requireSaleReference(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleViolation(
        "The required field saleReference was not provided",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "saleReference",
        undefined,
      );
    }
    if (trimmed.length > SALE_REFERENCE_MAX_LENGTH) {
      throw new BusinessRuleViolation(
        `The sale reference exceeds ${SALE_REFERENCE_MAX_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        "saleReference",
        undefined,
      );
    }
    return trimmed;
  }

  private static requireDiscountAmount(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
      throw new BusinessRuleViolation(
        "The discount amount must be greater than or equal to zero",
        ErrorCode.INVALID_INPUT,
        "discountAmount",
        undefined,
      );
    }
    return value;
  }

  private static requirePositiveInteger(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 1) {
      throw new BusinessRuleViolation(
        `The field ${field} must be an integer greater than zero`,
        ErrorCode.INVALID_INPUT,
        field,
        undefined,
      );
    }
    return value;
  }
}

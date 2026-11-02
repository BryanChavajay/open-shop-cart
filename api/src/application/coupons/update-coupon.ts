import { Coupon } from "../../domain/coupons/entities/coupon.entity.js";
import type { CouponSnapshot } from "../../domain/coupons/entities/coupon.entity.js";
import type {
  CouponReadRepository,
  CouponWriteRepository,
} from "../../domain/coupons/interfaces/repositories/coupon.repository.js";
import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { CouponDiscountType } from "../../domain/coupons/enums/coupon-discount-type.enum.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { CouponScope } from "../../domain/coupons/enums/coupon-scope.enum.js";
import type { UnitOfWork } from "../shared/unit-of-work.js";
import type { CouponActor } from "./shared/dependencies.js";
import { auditEntryForCoupons } from "./shared/audit.js";

export interface UpdateCouponCommand {
  actor: CouponActor;
  couponPublicId: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  /** Required for CATEGORY scope; must be null for CART scope. */
  categoryPublicId: string | null;
  minPurchaseAmount: number;
  maxTotalUses: number;
  maxUsesPerCustomer: number;
  /** ISO UTC instant the coupon becomes redeemable. */
  startsAt: string;
  /** ISO UTC instant the coupon stops being redeemable. */
  endsAt: string;
}

/** Commercial fields of the coupon, without the derived usage state. */
function auditValuesFor(snapshot: CouponSnapshot): Record<string, unknown> {
  return {
    code: snapshot.code,
    discountType: snapshot.discountType,
    discountValue: snapshot.discountValue,
    scope: snapshot.scope,
    categoryPublicId: snapshot.categoryPublicId,
    minPurchaseAmount: snapshot.minPurchaseAmount,
    maxTotalUses: snapshot.maxTotalUses,
    maxUsesPerCustomer: snapshot.maxUsesPerCustomer,
    startsAt: snapshot.startsAt,
    endsAt: snapshot.endsAt,
  };
}

/**
 * Replaces the commercial data of a coupon inside a transaction. The update is
 * a full replacement of the mutable fields; `isActive` is managed by the
 * activate/deactivate use cases and `usedCount` is never editable.
 *
 * The total-usage limit cannot be lowered below the usages already recorded
 * (ConflictError/INVALID_COUPON_STATE). The per-customer limit is only checked
 * globally here; lowering it below a particular customer's count is rejected
 * by the persistence guards (stored procedure), whose error is mapped to
 * ConflictError/INVALID_COUPON_STATE by the repository.
 */
export class UpdateCoupon {
  constructor(
    private readonly reads: CouponReadRepository,
    private readonly catalogReads: CatalogReadRepository,
    private readonly writes: CouponWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: UpdateCouponCommand): Promise<{ publicId: string }> {
    const snapshot = await this.reads.findCouponByPublicId(
      command.couponPublicId,
    );
    // Logically deleted coupons are not addressable in this iteration.
    if (snapshot === null || snapshot.isDeleted) {
      throw new NotFoundError(
        "Coupon not found",
        ErrorCode.COUPON_NOT_FOUND,
        undefined,
        undefined,
      );
    }

    const coupon = Coupon.restore(snapshot);
    const previous = coupon.toSnapshot();

    if (command.maxTotalUses < previous.usedCount) {
      throw new ConflictError(
        "cannot lower the total usage limit below the recorded usages",
        ErrorCode.INVALID_COUPON_STATE,
        undefined,
        undefined,
      );
    }

    let categoryId = previous.categoryId;
    let categoryPublicId = previous.categoryPublicId;
    if (command.scope === CouponScope.CATEGORY) {
      const normalizedCategoryPublicId =
        command.categoryPublicId === null
          ? ""
          : command.categoryPublicId.trim();
      if (normalizedCategoryPublicId.length === 0) {
        throw new BusinessRuleViolation(
          "The required field categoryPublicId was not provided",
          ErrorCode.REQUIRED_FIELD_MISSING,
          "categoryPublicId",
          undefined,
        );
      }
      const category = await this.catalogReads.findCategoryByPublicId(
        normalizedCategoryPublicId,
      );
      if (category === null || category.isDeleted) {
        throw new NotFoundError(
          "Category not found",
          undefined,
          undefined,
          undefined,
        );
      }
      categoryId = category.id;
      categoryPublicId = category.publicId;
    } else if (
      command.categoryPublicId !== null &&
      command.categoryPublicId.trim().length > 0
    ) {
      throw new BusinessRuleViolation(
        "A cart-scope coupon cannot point to a category",
        ErrorCode.INVALID_INPUT,
        "categoryPublicId",
        undefined,
      );
    }

    // The entity revalidates every field (code, discount, limits, vigency).
    coupon.update({
      code: command.code,
      discountType: command.discountType,
      discountValue: command.discountValue,
      scope: command.scope,
      categoryPublicId,
      categoryId,
      minPurchaseAmount: command.minPurchaseAmount,
      maxTotalUses: command.maxTotalUses,
      maxUsesPerCustomer: command.maxUsesPerCustomer,
      startsAt: command.startsAt,
      endsAt: command.endsAt,
    });
    const current = coupon.toSnapshot();

    await this.unitOfWork.run(async (exec) => {
      await this.writes.updateCoupon(exec, coupon);
      await this.audit.append(
        auditEntryForCoupons(
          {
            entityType: "Coupon",
            entityIdentifier: coupon.publicId,
            action: AuditAction.UPDATE,
            previousValues: auditValuesFor(previous),
            newValues: auditValuesFor(current),
          },
          command.actor,
        ),
        exec,
      );
    });

    return { publicId: coupon.publicId };
  }
}

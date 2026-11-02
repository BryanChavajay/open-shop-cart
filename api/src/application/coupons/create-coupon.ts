import { Coupon } from "../../domain/coupons/entities/coupon.entity.js";
import type { CouponWriteRepository } from "../../domain/coupons/interfaces/repositories/coupon.repository.js";
import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { CouponDiscountType } from "../../domain/coupons/enums/coupon-discount-type.enum.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { CouponScope } from "../../domain/coupons/enums/coupon-scope.enum.js";
import type { UnitOfWork } from "../shared/unit-of-work.js";
import type { CouponActor } from "./shared/dependencies.js";
import { auditEntryForCoupons } from "./shared/audit.js";

export interface CreateCouponCommand {
  actor: CouponActor;
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
  isActive: boolean;
}

/**
 * Creates an administrative coupon inside a transaction.
 *
 * For CATEGORY scope the target category is resolved first (deleted or unknown
 * categories report NotFoundError); its internal id is persisted alongside the
 * public one. For CART scope `categoryPublicId` must be null.
 *
 * Code uniqueness is enforced by the filtered unique index over codes of
 * non-deleted coupons: no exception is captured here; the sql-error mapping
 * turns the unique violation into a DuplicateKeyError (409) automatically
 * when it fails. Logically deleted coupons release their code.
 */
export class CreateCoupon {
  constructor(
    private readonly catalogReads: CatalogReadRepository,
    private readonly writes: CouponWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
  ) {}

  async execute(command: CreateCouponCommand): Promise<{ publicId: string }> {
    let categoryId: number | null = null;
    let categoryPublicId: string | null = null;
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

    const coupon = Coupon.create({
      publicId: this.identifiers.newPublicId(),
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
      isActive: command.isActive,
    });

    await this.unitOfWork.run(async (exec) => {
      await this.writes.insertCoupon(exec, coupon);
      await this.audit.append(
        auditEntryForCoupons(
          {
            entityType: "Coupon",
            entityIdentifier: coupon.publicId,
            action: AuditAction.CREATE,
            newValues: {
              code: coupon.code,
              discountType: coupon.discountType,
              discountValue: coupon.discountValue,
              scope: coupon.scope,
              categoryPublicId: coupon.categoryPublicId,
              minPurchaseAmount: coupon.minPurchaseAmount,
              maxTotalUses: coupon.maxTotalUses,
              maxUsesPerCustomer: coupon.maxUsesPerCustomer,
              startsAt: coupon.startsAt,
              endsAt: coupon.endsAt,
              isActive: coupon.isActive,
            },
          },
          command.actor,
        ),
        exec,
      );
    });

    return { publicId: coupon.publicId };
  }
}

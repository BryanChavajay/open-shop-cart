import { Coupon } from "../../domain/coupons/entities/coupon.entity.js";
import type {
  CouponReadRepository,
  CouponWriteRepository,
} from "../../domain/coupons/interfaces/repositories/coupon.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import type { UnitOfWork } from "../shared/unit-of-work.js";
import type { CouponActor } from "./shared/dependencies.js";
import { auditEntryForCoupons } from "./shared/audit.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface DeleteCouponCommand {
  actor: CouponActor;
  couponPublicId: string;
}

/**
 * Soft-deletes an administrative coupon inside a transaction. Recorded usages
 * (redemptions) are kept untouched for traceability; the deletion only frees
 * the code (the filtered unique index ignores deleted rows, so the same code
 * can be reused) and deactivates the coupon. Deleting an already deleted
 * coupon is not idempotent: it reports NotFoundError.
 */
export class DeleteCoupon {
  constructor(
    private readonly reads: CouponReadRepository,
    private readonly writes: CouponWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: DeleteCouponCommand): Promise<void> {
    const snapshot = await this.reads.findCouponByPublicId(
      command.couponPublicId,
    );
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
    coupon.markDeleted();

    await this.unitOfWork.run(async (exec) => {
      await this.writes.softDeleteCoupon(exec, requireInternalId(coupon.id));
      await this.audit.append(
        auditEntryForCoupons(
          {
            entityType: "Coupon",
            entityIdentifier: coupon.publicId,
            action: AuditAction.DELETE,
            previousValues: {
              code: previous.code,
              discountType: previous.discountType,
              discountValue: previous.discountValue,
              scope: previous.scope,
              categoryPublicId: previous.categoryPublicId,
              minPurchaseAmount: previous.minPurchaseAmount,
              maxTotalUses: previous.maxTotalUses,
              maxUsesPerCustomer: previous.maxUsesPerCustomer,
              usedCount: previous.usedCount,
              startsAt: previous.startsAt,
              endsAt: previous.endsAt,
              isActive: previous.isActive,
            },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

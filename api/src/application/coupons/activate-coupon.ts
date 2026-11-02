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

export interface ActivateCouponCommand {
  actor: CouponActor;
  couponPublicId: string;
}

/**
 * Activates a coupon so it can be redeemed again. The AuditAction enum has no
 * ACTIVATE member, so the change is logged as UPDATE with the new isActive.
 * Deletion is checked explicitly before the status write.
 */
export class ActivateCoupon {
  constructor(
    private readonly reads: CouponReadRepository,
    private readonly writes: CouponWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: ActivateCouponCommand): Promise<void> {
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
    const wasActive = coupon.isActive;
    coupon.activate();

    await this.unitOfWork.run(async (exec) => {
      await this.writes.updateCouponStatus(
        exec,
        requireInternalId(coupon.id),
        coupon.isActive,
      );
      await this.audit.append(
        auditEntryForCoupons(
          {
            entityType: "Coupon",
            entityIdentifier: coupon.publicId,
            action: AuditAction.UPDATE,
            previousValues: { isActive: wasActive },
            newValues: { isActive: true },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

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

export interface DeactivateCouponCommand {
  actor: CouponActor;
  couponPublicId: string;
}

/**
 * Deactivates a coupon without removing it. Logged as DEACTIVATE with only the
 * previous values, like the other modules. Deletion is checked explicitly
 * before the status write.
 */
export class DeactivateCoupon {
  constructor(
    private readonly reads: CouponReadRepository,
    private readonly writes: CouponWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: DeactivateCouponCommand): Promise<void> {
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
    coupon.deactivate();

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
            action: AuditAction.DEACTIVATE,
            previousValues: { isActive: wasActive },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

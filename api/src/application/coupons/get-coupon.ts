import type { CouponReadRepository } from "../../domain/coupons/interfaces/repositories/coupon.repository.js";
import type { CouponDetail } from "../../domain/coupons/readmodels/coupon.read-model.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";

export interface GetCouponQuery {
  couponPublicId: string;
}

/**
 * Administrative coupon detail. Deleted coupons are not addressable: the
 * persistence read filters them out and the empty result maps to NotFound.
 * Timing and category metadata travel in the detail row produced by the
 * repository (`findCouponDetailByPublicId`).
 */
export class GetCoupon {
  constructor(private readonly reads: CouponReadRepository) {}

  async execute(query: GetCouponQuery): Promise<CouponDetail> {
    const detail = await this.reads.findCouponDetailByPublicId(
      query.couponPublicId,
    );
    if (detail === null) {
      throw new NotFoundError(
        "Coupon not found",
        ErrorCode.COUPON_NOT_FOUND,
        undefined,
        undefined,
      );
    }
    return detail;
  }
}

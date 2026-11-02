import type { CommandExecutor } from "../../../shared/interfaces/providers/sql-executor.js";
import type { PaginatedReadModel } from "../../../shared/readmodels/paginated.read-model.js";
import type { Coupon, CouponSnapshot } from "../../entities/coupon.entity.js";
import type { CouponRedemption } from "../../entities/coupon-redemption.entity.js";
import type {
  CouponDetail,
  CouponListItem,
} from "../../readmodels/coupon.read-model.js";

/**
 * Result of the locked by-code search used for transactional redemption: a row
 * lock on the coupon (UPDLOCK) paired with its per-customer use count, read
 * inside the same transaction.
 */
export interface LockedCouponRow {
  snapshot: CouponSnapshot;
  customerUsageCount: number;
}

export interface CouponWriteRepository {
  /** The stored procedure returns the generated internal id. */
  insertCoupon(executor: CommandExecutor, coupon: Coupon): Promise<number>;
  updateCoupon(executor: CommandExecutor, coupon: Coupon): Promise<void>;
  updateCouponStatus(
    executor: CommandExecutor,
    couponInternalId: number,
    isActive: boolean,
  ): Promise<void>;
  softDeleteCoupon(
    executor: CommandExecutor,
    couponInternalId: number,
  ): Promise<void>;
  recordCouponUse(
    executor: CommandExecutor,
    redemption: CouponRedemption,
  ): Promise<void>;
}

export interface CouponReadRepository {
  withExecutor(executor: CommandExecutor): CouponReadRepository;
  findCouponByPublicId(publicId: string): Promise<CouponSnapshot | null>;
  /**
   * Admin detail: same row as `findCouponByPublicId` plus the persistence and
   * category metadata the snapshot does not carry (timestamps, category name).
   * Null when the coupon does not exist or is deleted.
   */
  findCouponDetailByPublicId(publicId: string): Promise<CouponDetail | null>;
  /** Only non-deleted coupons; persistence filters them out. */
  findCouponByCode(code: string): Promise<CouponSnapshot | null>;
  findLockedCouponByCode(
    executor: CommandExecutor,
    code: string,
    customerId: number,
  ): Promise<LockedCouponRow | null>;
  listCoupons(
    page: number,
    pageSize: number,
    onlyActive: boolean,
  ): Promise<PaginatedReadModel<CouponListItem>>;
  countCustomerUses(
    couponInternalId: number,
    customerId: number,
  ): Promise<number>;
}

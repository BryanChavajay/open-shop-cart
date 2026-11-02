import type { CreateCoupon } from "./create-coupon.js";
import type { UpdateCoupon } from "./update-coupon.js";
import type { ActivateCoupon } from "./activate-coupon.js";
import type { DeactivateCoupon } from "./deactivate-coupon.js";
import type { DeleteCoupon } from "./delete-coupon.js";
import type { GetCoupon } from "./get-coupon.js";
import type { ListCoupons } from "./list-coupons.js";
import type { EvaluateCoupon } from "./evaluate-coupon.js";
import type { RedeemCoupon } from "./redeem-coupon.js";

export type { CouponActor } from "./shared/dependencies.js";
export type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
export { runOrJoin } from "../shared/unit-of-work.js";
export { auditEntryForCoupons } from "./shared/audit.js";
export {
  buildCouponApplicationResult,
  formatAmount,
  sumAmounts,
} from "./shared/coupon-result.js";
export type { LockedCouponRow } from "../../domain/coupons/interfaces/repositories/coupon.repository.js";
export type { CouponApplicationResult } from "../../domain/coupons/interfaces/coupon-evaluation-context.js";

/** Plain grouped bag of coupons use cases (instanced by main wiring, stage 5). */
export interface CouponUseCases {
  create: CreateCoupon;
  update: UpdateCoupon;
  activate: ActivateCoupon;
  deactivate: DeactivateCoupon;
  delete: DeleteCoupon;
  get: GetCoupon;
  list: ListCoupons;
  /** Discount-only simulation, no persistence writes. */
  evaluate: EvaluateCoupon;
  /** Transactional redemption: locks the row, records the use and audits it. */
  redeem: RedeemCoupon;
}

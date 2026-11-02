import { z } from "zod";
import { paginatedSchema } from "../shared/paginated.schema.js";
import { CouponDiscountType } from "../../../../domain/coupons/enums/coupon-discount-type.enum.js";
import { CouponScope } from "../../../../domain/coupons/enums/coupon-scope.enum.js";

/** Body acknowledged by create/update: only the new public id leaves the module. */
export const createdCouponSchema = z.object({ publicId: z.uuid() });

/** Element of the administrative listing (full row of the read model). */
export const couponListItemSchema = z.object({
  publicId: z.uuid(),
  /** Normalized (uppercase) stored code. */
  code: z.string(),
  discountType: z.enum(CouponDiscountType),
  discountValue: z.number(),
  scope: z.enum(CouponScope),
  categoryPublicId: z.uuid().nullable(),
  /** Name of the target category; null for CART scope. */
  categoryName: z.string().nullable(),
  minPurchaseAmount: z.number(),
  maxTotalUses: z.number(),
  maxUsesPerCustomer: z.number(),
  usedCount: z.number(),
  startsAt: z.string(),
  endsAt: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export const couponDetailSchema = couponListItemSchema.extend({
  updatedAt: z.string(),
});

export const paginatedCouponsSchema = paginatedSchema(couponListItemSchema);

/** Discount assigned to a single cart line as a 2-decimal string. */
const lineDiscountAllocationSchema = z.object({
  linePublicId: z.string(),
  variantPublicId: z.string(),
  originalSubtotalGross: z.string(),
  discountGross: z.string(),
  finalSubtotalGross: z.string(),
});

/** Prediction (evaluate) / outcome (redeem) of applying one coupon to a cart. */
export const couponApplicationResultSchema = z.object({
  couponPublicId: z.uuid(),
  code: z.string(),
  cartSubtotalGross: z.string(),
  eligibleSubtotalGross: z.string(),
  discountGross: z.string(),
  finalTotalGross: z.string(),
  lineAllocations: z.array(lineDiscountAllocationSchema),
});

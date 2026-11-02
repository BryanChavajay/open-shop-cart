import { z } from "zod";
import { CouponScope } from "../../../../domain/coupons/enums/coupon-scope.enum.js";
import { CouponDiscountType } from "../../../../domain/coupons/enums/coupon-discount-type.enum.js";

// --- shared field shapes ---

const positiveInteger = z.coerce.number().int().positive();

const pageQuery = positiveInteger.optional().default(1);

const pageSizeQuery = positiveInteger.pipe(z.number().max(100)).optional().default(20);

/** Boolean flag received as a query string ("true"/"false"). */
const booleanFromQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

/** Monetary cap (in units) for any amount accepted by the API. */
const MONEY_MAX = 99_999_999;

const moneyMessage = "El monto debe tener hasta dos decimales";

function hasAtMostTwoDecimals(value: number): boolean {
  const fraction = String(value).split(".")[1] ?? "";
  return fraction.length <= 2;
}

const positiveMoney = z
  .number()
  .positive()
  .max(MONEY_MAX)
  .refine(hasAtMostTwoDecimals, moneyMessage);

const nonNegativeMoney = z
  .number()
  .min(0)
  .max(MONEY_MAX)
  .refine(hasAtMostTwoDecimals, moneyMessage);

/**
 * Money travels between cart and coupons as exact 2-decimal strings, the
 * convention of DiscountableLineItem ("12.50", never "12.5" or negative).
 */
const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})$/, moneyMessage);

const couponCode = z.string().trim().min(1).max(64);

/** Public ids of cart lines and variants are opaque business references. */
const businessReferenceId = z.string().trim().min(1).max(100);

// --- params ---

export const couponPublicIdParamsSchema = z.strictObject({
  couponPublicId: z.uuid(),
});

// --- admin listing ---

export const listCouponsQuerySchema = z.strictObject({
  onlyActive: booleanFromQuery.optional().default(false),
  page: pageQuery,
  pageSize: pageSizeQuery,
});

// --- create / update bodies ---

interface CouponCommercialBody {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  /** Null for CART scope (absent means null); required for CATEGORY scope. */
  categoryPublicId: string | null;
  minPurchaseAmount: number;
  maxTotalUses: number;
  maxUsesPerCustomer: number;
  startsAt: string;
  endsAt: string;
}

/** Cross-field rules the repository/entity enforces, surfaced as 400 details. */
function checkCouponInvariants(value: CouponCommercialBody, ctx: z.RefinementCtx): void {
  if (
    value.discountType === CouponDiscountType.PERCENTAGE &&
    value.discountValue > 100
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: "El descuento porcentual no puede exceder 100",
    });
  }
  if (value.scope === CouponScope.CART && value.categoryPublicId !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["categoryPublicId"],
      message: "Un cupón de alcance CART no puede apuntar a una categoría",
    });
  }
  if (
    value.scope === CouponScope.CATEGORY &&
    value.categoryPublicId === null
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["categoryPublicId"],
      message: "El campo categoryPublicId es obligatorio para cupones de alcance CATEGORY",
    });
  }
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "endsAt debe ser posterior a startsAt",
    });
  }
}

const commercialFields = {
  code: couponCode,
  discountType: z.enum(CouponDiscountType),
  discountValue: positiveMoney,
  scope: z.enum(CouponScope),
  // Absent is accepted on create bodies and normalized to null (CART scope).
  categoryPublicId: z.uuid().nullable().default(null),
  minPurchaseAmount: nonNegativeMoney,
  maxTotalUses: positiveInteger,
  maxUsesPerCustomer: positiveInteger,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
};

export const createCouponSchema = z
  .strictObject({ ...commercialFields, isActive: z.boolean() })
  .superRefine(checkCouponInvariants);

/**
 * Full replacement of the commercial fields (same fields as create).
 * `isActive` is NOT editable here: it belongs to the activate/deactivate
 * use cases and `usedCount` is never editable.
 */
export const updateCouponSchema = z
  .strictObject(commercialFields)
  .superRefine(checkCouponInvariants);

// --- evaluation (client) ---

/** One cart line eligible for evaluation, mirroring DiscountableLineItem. */
const discountableLineItem = z.strictObject({
  linePublicId: businessReferenceId,
  variantPublicId: businessReferenceId,
  categoryPublicId: businessReferenceId,
  quantity: positiveInteger,
  unitPriceGross: moneyString,
  subtotalGross: moneyString,
});

/**
 * Body of the discount-only coupon evaluation. `items` cannot be empty: with
 * no lines there is nothing the coupon could apply to. `alreadyAppliedCouponCount`
 * defaults to 0 (no stacking allowed by the entity).
 */
export const evaluateCouponSchema = z.strictObject({
  code: couponCode,
  alreadyAppliedCouponCount: z.coerce.number().int().min(0).optional().default(0),
  items: z.array(discountableLineItem).min(1),
});

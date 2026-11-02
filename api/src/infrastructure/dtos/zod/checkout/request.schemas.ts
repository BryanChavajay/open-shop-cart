import { z } from "zod";
import { PaymentMethod } from "../../../../domain/checkout/enums/payment-method.enum.js";

// --- shared field shapes ---

const positiveInteger = z.coerce.number().int().positive();

/** Checkout lines: whole positive quantities addressed by variant public id. */
export const checkoutLineSchema = z.strictObject({
  variantPublicId: z.uuid(),
  quantity: positiveInteger.pipe(
    z.number().max(999_999_999, "La cantidad no puede exceder 999,999,999"),
  ),
});

/** Dupes travel separately from the line shape since lines are an array. */

export const idempotencyHeaderSchema = z.string().trim().min(1).max(100);

// --- initiate (quote + reservation) ---

export const initiateCheckoutSchema = z.strictObject({
  items: z
    .array(checkoutLineSchema)
    .min(1, "El carrito de cotización requiere al menos una línea"),
  addressPublicId: z.uuid().optional(),
  couponCode: z.string().trim().min(1).max(64).optional(),
});

export const reservationParamsSchema = z.strictObject({
  reservationPublicId: z.uuid(),
});

// --- confirmation payment selection ---

export const paymentSchema = z.discriminatedUnion("method", [
  z.strictObject({
    method: z.literal(PaymentMethod.BANK_TRANSFER),
    bankName: z.string().trim().min(1).max(100),
    referenceNumber: z.string().trim().min(1).max(100),
  }),
  z.strictObject({
    method: z.literal(PaymentMethod.CASH_ON_DELIVERY),
  }),
  z.strictObject({
    method: z.literal(PaymentMethod.CARD),
    source: z.string().trim().min(1).max(255),
  }),
]);

export const confirmCheckoutSchema = z.strictObject({
  reservationPublicId: z.uuid(),
  addressPublicId: z.uuid(),
  items: z
    .array(checkoutLineSchema)
    .min(1, "El carrito de confirmación requiere al menos una línea"),
  couponCode: z.string().trim().min(1).max(64).optional(),
  cartToken: z.string().trim().min(1).max(200).nullable().optional(),
  payment: paymentSchema,
});

// --- operator verification ---

export const verifyPaymentParamsSchema = z.strictObject({
  orderPublicId: z.uuid(),
});

/**
 * Approximate evidence to REJECT requires the documented reason; the case of
 * use enforces that (the schema only bounds the field).
 */
export const verifyPaymentSchema = z.strictObject({
  decided: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(1).max(300).optional(),
});

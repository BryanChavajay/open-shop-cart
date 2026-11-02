import { z } from "zod";
import { OrderStatus } from "../../../../domain/checkout/enums/order-status.enum.js";
import { PaymentStatus } from "../../../../domain/checkout/enums/payment-status.enum.js";
import { PaymentMethod } from "../../../../domain/checkout/enums/payment-method.enum.js";

/** One quoted line of a checkout initiation. */
export const quoteLineSchema = z.object({
  variantPublicId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantName: z.string(),
  quantity: z.number().int().positive(),
  unitPriceGross: z.string(),
  subtotalGross: z.string(),
  discountGross: z.string().nullable(),
  finalGross: z.string(),
});

/** Amounts frozen for the 15-minute reservation. */
export const checkoutInitiationSchema = z.object({
  reservationPublicId: z.uuid(),
  expiresAt: z.iso.datetime(),
  subtotalGross: z.string(),
  discountGross: z.string(),
  shippingCost: z.string(),
  totalPayable: z.string(),
  couponCode: z.string().nullable(),
  lineItems: z.array(quoteLineSchema),
});

/** Frozen line of the created order. */
export const frozenLineSchema = z.object({
  linePublicId: z.uuid(),
  variantPublicId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantName: z.string(),
  quantity: z.number().int().positive(),
  unitPriceGross: z.string(),
  subtotalGross: z.string(),
  discountGross: z.string(),
  totalGross: z.string(),
});

/** Result of the atomic confirmation (the order accepted by the database). */
export const checkoutConfirmationSchema = z.object({
  orderPublicId: z.uuid(),
  orderNumber: z.string(),
  createdAt: z.iso.datetime(),
  orderStatus: z.enum(OrderStatus),
  paymentStatus: z.enum(PaymentStatus),
  paymentMethod: z.enum(PaymentMethod),
  subtotalGross: z.string(),
  discountTotal: z.string(),
  shippingCost: z.string(),
  taxTotal: z.string(),
  totalPayable: z.string(),
  couponCode: z.string().nullable(),
  lineItems: z.array(frozenLineSchema),
});

/** Result of the operator verification of a bank transfer. */
export const paymentVerificationSchema = z.object({
  orderPublicId: z.uuid(),
  orderNumber: z.string(),
  orderStatus: z.enum(OrderStatus),
  paymentStatus: z.enum(PaymentStatus),
});

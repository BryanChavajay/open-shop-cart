import { z } from "zod";
import { paginatedSchema } from "../shared/paginated.schema.js";
import { OrderStatus } from "../../../../domain/checkout/enums/order-status.enum.js";
import { PaymentStatus } from "../../../../domain/checkout/enums/payment-status.enum.js";
import { PaymentMethod } from "../../../../domain/checkout/enums/payment-method.enum.js";

// --- summary row (rowset of the listing procedures, shared by both lists) ---

export const orderSummarySchema = z.object({
  id: z.number().int().positive(),
  publicId: z.uuid(),
  orderNumber: z.string(),
  userId: z.number().int().positive(),
  userPublicId: z.uuid(),
  userEmail: z.string(),
  userFirstName: z.string(),
  userLastName: z.string(),
  subtotalGross: z.number(),
  discountTotal: z.number(),
  shippingCost: z.number(),
  totalNet: z.number(),
  totalTax: z.number(),
  totalPayable: z.number(),
  orderStatus: z.enum(OrderStatus),
  paymentStatus: z.enum(PaymentStatus),
  paymentMethod: z.enum(PaymentMethod),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  paymentPublicId: z.uuid().nullable(),
  paymentAmount: z.number().nullable(),
  bankName: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  totalLines: z.number().int().nonnegative(),
  totalUnits: z.number().int().nonnegative(),
});

export const paginatedOwnOrdersSchema = paginatedSchema(orderSummarySchema);

export const paginatedAdminOrdersSchema = paginatedSchema(orderSummarySchema);

// --- detail (RF-01 / RF-02) ---

export const orderDetailSchema = z.object({
  id: z.number().int().positive(),
  publicId: z.uuid(),
  orderNumber: z.string(),
  userId: z.number().int().positive(),
  addressOriginPublicId: z.uuid(),
  reservationId: z.number().int().positive().nullable(),
  couponId: z.number().int().positive().nullable(),
  couponCode: z.string().nullable(),
  recipientFirstName: z.string(),
  recipientLastName: z.string(),
  deliveryPhone: z.string(),
  deliveryDepartment: z.string(),
  deliveryMunicipality: z.string(),
  deliveryExactAddress: z.string(),
  deliveryReference: z.string(),
  subtotalGross: z.number(),
  discountTotal: z.number(),
  shippingCost: z.number(),
  totalNet: z.number(),
  totalTax: z.number(),
  totalPayable: z.number(),
  orderStatus: z.enum(OrderStatus),
  paymentStatus: z.enum(PaymentStatus),
  paymentMethod: z.enum(PaymentMethod),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  paymentPublicId: z.uuid().nullable(),
  paymentAmount: z.number().nullable(),
  bankName: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  paymentRecordStatus: z.enum(PaymentStatus).nullable(),
  verifiedByUserId: z.number().int().positive().nullable(),
  verificationReason: z.string().nullable(),
  verifiedAt: z.iso.datetime().nullable(),
  userPublicId: z.uuid(),
  userEmail: z.string(),
  userFirstName: z.string(),
  userLastName: z.string(),
});

/** One frozen line of the order, as persisted at checkout. */
export const orderLineSnapshotSchema = z.object({
  linePublicId: z.uuid(),
  variantPublicId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantName: z.string(),
  quantity: z.number().int().positive(),
  quantityReturned: z.number().int().nonnegative(),
  unitPriceNet: z.number(),
  unitPriceGross: z.number(),
  subtotalGross: z.number(),
  discountGross: z.number(),
  totalGross: z.number(),
});

/** One entry of the order state history. */
export const orderHistoryEntrySchema = z.object({
  previousStatus: z.enum(OrderStatus).nullable(),
  newStatus: z.enum(OrderStatus),
  reason: z.string().nullable(),
  occurredAt: z.iso.datetime(),
  userEmail: z.string(),
  userRole: z.string(),
});

/** Order header + lines + history, shared by the own and admin detail routes. */
export const orderDetailResponseSchema = z.object({
  order: orderDetailSchema,
  lines: z.array(orderLineSnapshotSchema),
  history: z.array(orderHistoryEntrySchema),
});

// --- mutations (transition / cancellation / return) ---

/** States reported after a staff forward transition or a cancellation. */
const orderStateResultSchema = z.object({
  orderPublicId: z.uuid(),
  orderNumber: z.string(),
  orderStatus: z.enum(OrderStatus),
  paymentStatus: z.enum(PaymentStatus),
});

export const orderTransitionSchema = orderStateResultSchema;

export const orderCancellationSchema = orderStateResultSchema.extend({
  /** Units sent back to the physical stock during the cancellation. */
  reintegratedUnits: z.number().int().nonnegative(),
});

export const orderReturnLineSchema = z.object({
  linePublicId: z.uuid(),
  variantPublicId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  variantName: z.string(),
  quantity: z.number().int().positive(),
  quantityReturned: z.number().int().nonnegative(),
});

export const orderReturnSchema = z.object({
  orderPublicId: z.uuid(),
  lines: z.array(orderReturnLineSchema),
});

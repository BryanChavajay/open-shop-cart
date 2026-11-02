import { z } from "zod";
import { OrderStatus } from "../../../../domain/checkout/enums/order-status.enum.js";
import { PaymentStatus } from "../../../../domain/checkout/enums/payment-status.enum.js";

// --- shared field shapes ---

const positiveInteger = z.coerce.number().int().positive();

const pageQuery = positiveInteger.optional().default(1);

const pageSizeQuery = positiveInteger
  .pipe(z.number().max(100))
  .optional()
  .default(20);

/** Lifecycle states admitted by the staff forward transition. */
const forwardTargetStatus = z.enum([
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

/** Free documentation field shared by transitions, cancellations and returns. */
const optionalReason = z.string().trim().max(300);

// --- params ---

export const orderPublicIdParamsSchema = z.strictObject({
  orderPublicId: z.uuid(),
});

// --- own (customer) listing (RF-01) ---

export const listOwnOrdersQuerySchema = z.strictObject({
  orderStatus: z.enum(OrderStatus).optional(),
  page: pageQuery,
  pageSize: pageSizeQuery,
});

// --- admin listing (RF-02). @Busqueda is NVARCHAR(254) in the procedure. ---

export const listAdminOrdersQuerySchema = z.strictObject({
  orderStatus: z.enum(OrderStatus).optional(),
  paymentStatus: z.enum(PaymentStatus).optional(),
  customerPublicId: z.uuid().optional(),
  search: z.string().trim().min(1).max(254).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: pageQuery,
  pageSize: pageSizeQuery,
});

// --- staff status transition (RF-02) ---

export const transitionOrderStatusSchema = z.strictObject({
  targetStatus: forwardTargetStatus,
  reason: optionalReason,
});

// --- cancellations (RF-01 own / RF-02 staff) ---

export const cancelOrderSchema = z.strictObject({
  reason: optionalReason,
});

/** Staff cancellation requires the documented reason (entity/audit evidence). */
export const cancelOrderByStaffSchema = z.strictObject({
  reason: z.string().trim().min(1).max(300),
});

// --- customer returns (RF-03) ---

export const returnItemSchema = z.strictObject({
  linePublicId: z.uuid(),
  quantity: positiveInteger.pipe(
    z.number().max(999_999_999, "La cantidad no puede exceder 999,999,999"),
  ),
});

export const registerOrderReturnSchema = z.strictObject({
  items: z
    .array(returnItemSchema)
    .min(1, "El registro de devolución requiere al menos una línea"),
  reason: optionalReason,
});

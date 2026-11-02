import { z } from "zod";
import { StockMovementType } from "../../../../domain/inventory/enums/stock-movement-type.enum.js";
import type { ListInventoryQuery } from "../../../../application/inventory/list-inventory.js";
import type { ListVariantKardexQuery } from "../../../../application/inventory/list-variant-kardex.js";

// --- shared field shapes ---

const positiveInteger = z.coerce.number().int().positive();

const pageQuery = positiveInteger.optional().default(1);

const pageSizeQuery = positiveInteger.pipe(z.number().max(100)).optional().default(20);

/** Boolean flag received as a query string ("true"/"false"). */
const booleanFromQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

/** Upper bound for any stock quantity handled by the API. */
const STOCK_QUANTITY_MAX = 999_999_999;

const stockQuantity = z.coerce.number().int().positive().max(STOCK_QUANTITY_MAX, `La cantidad no puede exceder ${STOCK_QUANTITY_MAX}`);

/** Mandatory documentation of a stock movement. */
const movementReason = z.string().trim().min(1).max(200);

/** Optional document reference (invoice, receipt, count sheet...). */
const sourceReference = z.string().trim().min(1).max(100).nullable().optional();

// --- params ---

/** Params of any route addressed by the variant public id. */
export const variantParamsSchema = z.strictObject({ variantPublicId: z.uuid() });

// --- stock writes ---

/**
 * Body of the purchase receipt: registers received units. The idempotency key
 * travels in the `Idempotency-Key` header, not in the body.
 */
export const receivePurchaseStockSchema = z.strictObject({
  quantity: stockQuantity,
  reason: movementReason,
  sourceReference,
});

/**
 * Body of the manual adjustment: signed whole variation of the physical
 * stock; must be non-zero and bounded.
 */
export const adjustStockSchema = z.strictObject({
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0, "La variación no puede ser cero")
    .refine((value) => Math.abs(value) <= STOCK_QUANTITY_MAX, `La variación no puede exceder ${STOCK_QUANTITY_MAX}`),
  reason: movementReason,
  sourceReference,
});

// --- idempotency header ---

/**
 * Client-provided idempotency key of a stock write. The validate middleware
 * only handles body/params/query, so the controller applies this schema to
 * the header value itself via safeParse.
 */
export const idempotencyHeaderSchema = z.string().trim().min(1).max(100);

// --- queries ---

/**
 * Inventory balance listing query (`?q=` is the search text matched against
 * SKU or product name). Transformed into the use-case filter directly.
 */
export const listInventoryQuerySchema = z
  .strictObject({
    q: z.string().trim().min(1).max(100).optional(),
    onlyAvailable: booleanFromQuery.optional().default(false),
    isActive: booleanFromQuery.optional(),
    page: pageQuery,
    pageSize: pageSizeQuery,
  })
  .transform(
    ({ q, onlyAvailable, isActive, page, pageSize }): ListInventoryQuery => ({
      page,
      pageSize,
      onlyAvailable,
      ...(q !== undefined ? { searchText: q } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    }),
  );

/**
 * Kardex listing query for one variant. Dates are full ISO instants; the
 * bounds are inclusive on both ends.
 */
export const kardexQuerySchema = z
  .strictObject({
    movementType: z.enum(StockMovementType).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    page: pageQuery,
    pageSize: pageSizeQuery,
  })
  .transform(
    ({ movementType, from, to, page, pageSize }): Omit<ListVariantKardexQuery, "variantPublicId"> => ({
      page,
      pageSize,
      ...(movementType !== undefined ? { movementType } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    }),
  );

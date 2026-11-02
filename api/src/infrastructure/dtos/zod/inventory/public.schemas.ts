import { z } from "zod";
import { StockMovementType } from "../../../../domain/inventory/enums/stock-movement-type.enum.js";
import { paginatedSchema } from "../shared/paginated.schema.js";

/** Result of an idempotent inventory write: the movement created or replayed. */
export const createdInventoryOperationSchema = z.object({ publicId: z.uuid() });

/** Full stock balance of one variant. */
export const variantStockSchema = z.object({
  variantPublicId: z.uuid(),
  sku: z.string(),
  productName: z.string(),
  isActive: z.boolean(),
  isDeleted: z.boolean(),
  physicalQuantity: z.number().int(),
  reservedQuantity: z.number().int(),
  availableQuantity: z.number().int(),
  updatedAt: z.string(),
});
export const paginatedInventorySchema = paginatedSchema(variantStockSchema);

export const movementSchema = z.object({
  publicId: z.uuid(),
  variantPublicId: z.uuid(),
  movementType: z.enum(StockMovementType),
  quantityDelta: z.number().int(),
  balanceBefore: z.number().int(),
  balanceAfter: z.number().int(),
  reason: z.string(),
  sourceReference: z.string().nullable(),
  relatedSalePublicId: z.string().nullable(),
  userPublicId: z.uuid(),
  userName: z.string(),
  createdAt: z.string(),
});
export const paginatedMovementsSchema = paginatedSchema(movementSchema);

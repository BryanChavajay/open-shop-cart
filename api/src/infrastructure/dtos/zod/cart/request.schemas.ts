import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive();

/**
 * Body of a cart activity beat: the beat carries no data at all, so the
 * schema accepts an absent body or an empty object and rejects anything else.
 */
export const cartActivityBodySchema = z.strictObject({}).optional();

/**
 * Abandoned-cart report listing query, mirrored from the use-case input:
 * page defaults to 1 and pageSize defaults to 100, capped at 100.
 */
export const listAbandonedCartsQuerySchema = z.strictObject({
  page: positiveInteger.optional().default(1),
  pageSize: positiveInteger.pipe(z.number().max(100)).optional().default(100),
});

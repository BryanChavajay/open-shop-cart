import { z } from "zod";
import { paginatedSchema } from "../shared/paginated.schema.js";

/**
 * Public shape of one abandoned-cart report item. Token hashes never leave
 * the module; only identifiers and activity instants are exposed.
 */
export const abandonedCartSchema = z.object({
  publicId: z.uuid(),
  userPublicId: z.uuid().nullable(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
  abandonedAt: z.string(),
  closedAt: z.string().nullable(),
});

export const paginatedAbandonedCartsSchema = paginatedSchema(abandonedCartSchema);

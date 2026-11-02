import { z } from "zod";
import { paginatedSchema } from "../shared/paginated.schema.js";

/** One row of the Guatemala departments catalog. */
export const departmentSchema = z.object({
  publicId: z.uuid(),
  code: z.string(),
  name: z.string(),
});

/** One row of a department's municipality catalog. */
export const municipalitySchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
});

/** Customer delivery address with the joined geography names. */
export const addressDetailSchema = z.object({
  publicId: z.uuid(),
  recipientFirstName: z.string(),
  recipientLastName: z.string(),
  phone: z.string(),
  municipalityPublicId: z.uuid(),
  municipalityName: z.string(),
  departmentName: z.string(),
  exactAddress: z.string(),
  reference: z.string(),
  registeredAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const paginatedAddressesSchema = paginatedSchema(addressDetailSchema);

export const createdAddressSchema = addressDetailSchema;

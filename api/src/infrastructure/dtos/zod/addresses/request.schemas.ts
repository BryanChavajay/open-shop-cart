import { z } from "zod";

// --- shared field shapes ---

const positiveInteger = z.coerce.number().int().positive();

const pageQuery = positiveInteger.optional().default(1);

const pageSizeQuery = positiveInteger
  .pipe(z.number().max(100))
  .optional()
  .default(20);

/** Receiver identity of the delivery. */
const requiredName = z.string().trim().min(1).max(100);

/** Phone as typed by the customer; the entity normalizes +502 prefixes away. */
const phone = z.string().trim().min(8).max(20);

/** Exact street address (zone, colonia, street, number...). */
const exactAddress = z.string().trim().min(1).max(300);

/** Delivery hint (door color, nearby landmark...). */
const reference = z.string().trim().min(1).max(300);

// --- params ---

export const departmentParamsSchema = z.strictObject({
  departmentPublicId: z.uuid(),
});

export const addressParamsSchema = z.strictObject({
  addressPublicId: z.uuid(),
});

// --- writes ---

/** Base fields of an address create/update; ownership never travels by input. */
const addressFields = {
  recipientFirstName: requiredName,
  recipientLastName: requiredName,
  phone,
  municipalityPublicId: z.uuid(),
  exactAddress,
  reference,
};

export const createAddressSchema = z.strictObject(addressFields);

export const updateAddressSchema = z.strictObject(addressFields);

// --- queries ---

export const listOwnAddressesQuerySchema = z.strictObject({
  page: pageQuery,
  pageSize: pageSizeQuery,
});

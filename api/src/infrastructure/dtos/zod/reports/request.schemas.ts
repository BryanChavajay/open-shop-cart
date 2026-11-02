import { z } from "zod";
import { SalesPeriodGranularity } from "../../../../domain/reports/enums/sales-period-granularity.enum.js";

const positiveInteger = z.coerce.number().int().positive();

/** Shared window fields: `[from, to)` ISO datetimes, both optional. */
const fromField = z.iso.datetime().optional();
const toField = z.iso.datetime().optional();

// --- sales by period (RF-08) ---

export const salesByPeriodQuerySchema = z
  .strictObject({
    granularity: z.enum(SalesPeriodGranularity),
    from: fromField,
    to: toField,
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from < query.to, {
    message: "'from' must be earlier than 'to'",
    path: ["to"],
  });

// --- sales by category (RF-08) ---

export const salesByCategoryQuerySchema = z
  .strictObject({
    from: fromField,
    to: toField,
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from < query.to, {
    message: "'from' must be earlier than 'to'",
    path: ["to"],
  });

// --- top selling products (RF-08). @Limite is INT with a 1..100 range. ---

export const topSellingProductsQuerySchema = z
  .strictObject({
    from: fromField,
    to: toField,
    limit: positiveInteger.pipe(z.number().max(100)).optional().default(10),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from < query.to, {
    message: "'from' must be earlier than 'to'",
    path: ["to"],
  });

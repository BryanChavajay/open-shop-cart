import { z } from "zod";
import { SalesPeriodGranularity } from "../../../../domain/reports/enums/sales-period-granularity.enum.js";

// --- sales by period (RF-08) ---

export const salesByPeriodItemSchema = z.object({
  /** ISO `YYYY-MM-DD` start date of the period bucket. */
  periodStart: z.string(),
  ordersCount: z.number().int().nonnegative(),
  unitsSold: z.number().int().nonnegative(),
  salesAmount: z.number(),
  returnedAmount: z.number(),
  shippingAmount: z.number(),
  averageTicket: z.number(),
});

export const salesByPeriodSummarySchema = z.object({
  totalOrders: z.number().int().nonnegative(),
  totalUnitsSold: z.number().int().nonnegative(),
  totalSalesAmount: z.number(),
  totalReturnedAmount: z.number(),
  totalShippingAmount: z.number(),
  averageTicket: z.number(),
});

export const salesByPeriodReportSchema = z.strictObject({
  granularity: z.enum(SalesPeriodGranularity),
  items: z.array(salesByPeriodItemSchema),
  summary: salesByPeriodSummarySchema,
});

// --- sales by category (RF-08) ---

export const salesByCategoryItemSchema = z.object({
  categoryPublicId: z.uuid(),
  categoryName: z.string(),
  ordersCount: z.number().int().nonnegative(),
  unitsSold: z.number().int().nonnegative(),
  salesAmount: z.number(),
  returnedAmount: z.number(),
});

export const salesByCategoryReportSchema = z.strictObject({
  items: z.array(salesByCategoryItemSchema),
});

// --- top selling products (RF-08) ---

export const topSellingProductItemSchema = z.object({
  productPublicId: z.uuid(),
  productName: z.string(),
  categoryPublicId: z.uuid(),
  categoryName: z.string(),
  unitsSold: z.number().int().nonnegative(),
  salesAmount: z.number(),
  ordersCount: z.number().int().nonnegative(),
});

export const topSellingProductsReportSchema = z.strictObject({
  items: z.array(topSellingProductItemSchema),
});

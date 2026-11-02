import type { SalesPeriodGranularity } from "../enums/sales-period-granularity.enum.js";

/**
 * One period bucket of the sales-by-period report (Northwind-style time
 * series). All amounts are quetzales with scale 2 already applied.
 */
export interface SalesByPeriodItemReadModel {
  /** ISO start date of the period bucket (day / week / month start). */
  periodStart: string;
  /** Number of delivered + paid orders that fall inside the period. */
  ordersCount: number;
  /** Total units sold inside the period, net of returned units. */
  unitsSold: number;
  /** Effective sales amount of the period, net of returns. */
  salesAmount: number;
  /** Amount returned to customers inside the period. */
  returnedAmount: number;
  /** Informational sum of the shipping costs of the counted orders. */
  shippingAmount: number;
  /** salesAmount / ordersCount for the period; 0 when no orders. */
  averageTicket: number;
}

/** Aggregated totals of the whole queried window. */
export interface SalesByPeriodSummaryReadModel {
  /** Total delivered + paid orders in the window. */
  totalOrders: number;
  /** Total units sold in the window, net of returned units. */
  totalUnitsSold: number;
  /** Total effective sales amount in the window, net of returns. */
  totalSalesAmount: number;
  /** Total returned amount in the window. */
  totalReturnedAmount: number;
  /** Total shipping cost of the counted orders in the window. */
  totalShippingAmount: number;
  /** totalSalesAmount / totalOrders; 0 when no orders. */
  averageTicket: number;
}

/** Complete RF-08 sales-by-period report: buckets plus a global summary. */
export interface SalesByPeriodReportReadModel {
  /** Granularity used to build the buckets. */
  granularity: SalesPeriodGranularity;
  /** One entry per period bucket with activity, ordered by periodStart. */
  items: SalesByPeriodItemReadModel[];
  /** Aggregated totals for the whole window. */
  summary: SalesByPeriodSummaryReadModel;
}

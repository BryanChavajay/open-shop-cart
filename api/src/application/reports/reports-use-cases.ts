import { GetSalesByPeriod } from "./get-sales-by-period.js";
import { GetSalesByCategory } from "./get-sales-by-category.js";
import { GetTopSellingProducts } from "./get-top-selling-products.js";
import type { ReportsReadRepository } from "../../domain/reports/interfaces/repositories/reports.repository.js";

export type { SalesByPeriodQuery } from "./get-sales-by-period.js";
export type { SalesByCategoryQuery } from "./get-sales-by-category.js";
export type { TopSellingProductsQuery } from "./get-top-selling-products.js";
export { TOP_SELLING_PRODUCTS_DEFAULT_LIMIT } from "./get-top-selling-products.js";
export type {
  ReportsReadRepository,
} from "../../domain/reports/interfaces/repositories/reports.repository.js";
export { SalesPeriodGranularity } from "../../domain/reports/enums/sales-period-granularity.enum.js";
export type {
  SalesByPeriodItemReadModel,
  SalesByPeriodSummaryReadModel,
  SalesByPeriodReportReadModel,
} from "../../domain/reports/readmodels/sales-by-period.read-model.js";
export type { SalesByCategoryItemReadModel } from "../../domain/reports/readmodels/sales-by-category.read-model.js";
export type { TopSellingProductItemReadModel } from "../../domain/reports/readmodels/top-selling-product.read-model.js";

export interface ReportsQueryUseCases {
  salesByPeriod: GetSalesByPeriod;
  salesByCategory: GetSalesByCategory;
  topProducts: GetTopSellingProducts;
}

/** Grouped bag of the read-only reports use cases (RF-08), no writes. */
export interface ReportsUseCases {
  queries: ReportsQueryUseCases;
}

/** Instanced by main wiring; the reports module is read-only. */
export function createReportsUseCases(
  reports: ReportsReadRepository,
): ReportsUseCases {
  return {
    queries: {
      salesByPeriod: new GetSalesByPeriod(reports),
      salesByCategory: new GetSalesByCategory(reports),
      topProducts: new GetTopSellingProducts(reports),
    },
  };
}

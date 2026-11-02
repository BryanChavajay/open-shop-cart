import type { SalesPeriodGranularity } from "../../enums/sales-period-granularity.enum.js";
import type { SalesByCategoryItemReadModel } from "../../readmodels/sales-by-category.read-model.js";
import type { SalesByPeriodReportReadModel } from "../../readmodels/sales-by-period.read-model.js";
import type { TopSellingProductItemReadModel } from "../../readmodels/top-selling-product.read-model.js";

/**
 * Reads of the reports module (RF-08), mapped from the SP_Reportes_* read
 * procedures created in migration 012. All metrics consider only DELIVERED +
 * PAID orders and are net of returns.
 */
export interface ReportsReadRepository {
  /**
   * Sales time series grouped by period (day / ISO week Monday-start /
   * calendar month), including the global summary of the window.
   * `from`/`to` are ISO datetimes; the window is `[from, to)` (to exclusive).
   */
  getSalesByPeriod(filter: {
    granularity: SalesPeriodGranularity;
    from?: string;
    to?: string;
  }): Promise<SalesByPeriodReportReadModel>;
  /**
   * Effective sales per category, net of returns, ordered by `salesAmount`
   * descending.
   */
  getSalesByCategory(filter: {
    from?: string;
    to?: string;
  }): Promise<SalesByCategoryItemReadModel[]>;
  /**
   * Top-N products by units sold (net of returns); ties broken by sales
   * amount.
   */
  getTopSellingProducts(filter: {
    from?: string;
    to?: string;
    limit: number;
  }): Promise<TopSellingProductItemReadModel[]>;
}

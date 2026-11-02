import type { ReportsReadRepository } from "../../domain/reports/interfaces/repositories/reports.repository.js";
import type { SalesPeriodGranularity } from "../../domain/reports/enums/sales-period-granularity.enum.js";
import type { SalesByPeriodReportReadModel } from "../../domain/reports/readmodels/sales-by-period.read-model.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface SalesByPeriodQuery {
  /** Bucketing of the series: day, ISO week (Monday start) or month. */
  granularity: SalesPeriodGranularity;
  /** ISO datetime, inclusive lower bound of the window. */
  from?: string | undefined;
  /** ISO datetime, exclusive upper bound of the window. */
  to?: string | undefined;
}

/**
 * RF-08 sales time series, grouped by period, with the global summary of
 * the queried window. The repository counts only delivered + paid orders,
 * net of returns. When both bounds are provided, the half-open window
 * `[from, to)` must be non-empty (`from` strictly before `to`).
 */
export class GetSalesByPeriod {
  constructor(private readonly reports: ReportsReadRepository) {}

  async execute(
    query: SalesByPeriodQuery,
  ): Promise<SalesByPeriodReportReadModel> {
    this.assertDateWindow(query.from, query.to);
    return this.reports.getSalesByPeriod({
      granularity: query.granularity,
      ...(query.from !== undefined && { from: query.from }),
      ...(query.to !== undefined && { to: query.to }),
    });
  }

  /** Guards the window order when the application sees both bounds. */
  private assertDateWindow(from?: string, to?: string): void {
    if (from === undefined || to === undefined) {
      return;
    }
    if (!(new Date(from).getTime() < new Date(to).getTime())) {
      throw new BusinessRuleViolation(
        "The 'from' bound must be earlier than the 'to' bound",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
  }
}

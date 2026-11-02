import type { ReportsReadRepository } from "../../domain/reports/interfaces/repositories/reports.repository.js";
import type { SalesByCategoryItemReadModel } from "../../domain/reports/readmodels/sales-by-category.read-model.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface SalesByCategoryQuery {
  /** ISO datetime, inclusive lower bound of the window. */
  from?: string | undefined;
  /** ISO datetime, exclusive upper bound of the window. */
  to?: string | undefined;
}

/**
 * RF-08 effective sales per category, net of returns, ordered by sales
 * amount descending. When both bounds are provided, the half-open window
 * `[from, to)` must be non-empty (`from` strictly before `to`).
 */
export class GetSalesByCategory {
  constructor(private readonly reports: ReportsReadRepository) {}

  async execute(
    query: SalesByCategoryQuery,
  ): Promise<SalesByCategoryItemReadModel[]> {
    this.assertDateWindow(query.from, query.to);
    return this.reports.getSalesByCategory({
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

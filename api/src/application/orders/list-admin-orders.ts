import type {
  AdminOrderListFilters,
  AdminOrderSummaryRow,
  OrderReadRepository,
  OrderSummaryPage,
} from "../../domain/orders/interfaces/repositories/order.repository.js";
import type { PaginatedReadModel } from "../../domain/shared/readmodels/paginated.read-model.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

/**
 * Staff listing of every order (RF-02) with pagination and the business
 * filters (status, payment, customer, search, date window). Ownership never
 * applies here: the guard middleware already certified the staff actor.
 */
export class ListAdminOrders {
  constructor(private readonly orderReads: OrderReadRepository) {}

  async execute(
    filters: AdminOrderListFilters,
  ): Promise<PaginatedReadModel<AdminOrderSummaryRow>> {
    this.assertDateWindow(filters.from, filters.to);
    const page = await this.orderReads.listAdmin(filters);
    return this.toPaginated(page, filters.page, filters.pageSize);
  }

  /** Guards the creation-date window when the application sees both bounds. */
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

  /** Maps the `{ rows, totalRegisters }` page to the shared pagination shape. */
  private toPaginated(
    page: OrderSummaryPage<AdminOrderSummaryRow>,
    pageNumber: number,
    pageSize: number,
  ): PaginatedReadModel<AdminOrderSummaryRow> {
    return {
      items: page.rows,
      page: pageNumber,
      pageSize,
      totalItems: page.totalRegisters,
      totalPages: pageSize > 0 ? Math.ceil(page.totalRegisters / pageSize) : 0,
    };
  }
}

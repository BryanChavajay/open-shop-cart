import type {
  CustomerOrderSummaryRow,
  OrderReadRepository,
  OrderSummaryPage,
} from "../../domain/orders/interfaces/repositories/order.repository.js";
import type { PaginatedReadModel } from "../../domain/shared/readmodels/paginated.read-model.js";
import type { OrderStatus } from "../../domain/checkout/enums/order-status.enum.js";
import type { OrderActor } from "./shared/dependencies.js";

export interface ListOwnOrdersQuery {
  /** Customer taken from the guarded identity, never from the query string. */
  actor: OrderActor;
  orderStatus?: OrderStatus;
  page: number;
  pageSize: number;
}

/**
 * Paginated listing of one customer's own orders (RF-01), newest first. The
 * repository restricts the rows by the actor id, so no foreign order can be
 * listed.
 */
export class ListOwnOrders {
  constructor(private readonly orderReads: OrderReadRepository) {}

  async execute(
    query: ListOwnOrdersQuery,
  ): Promise<PaginatedReadModel<CustomerOrderSummaryRow>> {
    const page = await this.orderReads.listByCustomer(query.actor.id, {
      ...(query.orderStatus !== undefined && {
        orderStatus: query.orderStatus,
      }),
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.toPaginated(page, query.page, query.pageSize);
  }

  /** Maps the `{ rows, totalRegisters }` page to the shared pagination shape. */
  private toPaginated(
    page: OrderSummaryPage<CustomerOrderSummaryRow>,
    pageNumber: number,
    pageSize: number,
  ): PaginatedReadModel<CustomerOrderSummaryRow> {
    return {
      items: page.rows,
      page: pageNumber,
      pageSize,
      totalItems: page.totalRegisters,
      totalPages: pageSize > 0 ? Math.ceil(page.totalRegisters / pageSize) : 0,
    };
  }
}

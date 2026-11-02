import type {
  CustomerOrderSummaryRow,
  OrderReadRepository,
  OrderSummaryPage,
} from "../../domain/orders/interfaces/repositories/order.repository.js";
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
  ): Promise<OrderSummaryPage<CustomerOrderSummaryRow>> {
    return this.orderReads.listByCustomer(query.actor.id, {
      ...(query.orderStatus !== undefined && {
        orderStatus: query.orderStatus,
      }),
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}

import type {
  AdminOrderListFilters,
  AdminOrderSummaryRow,
  OrderReadRepository,
  OrderSummaryPage,
} from "../../domain/orders/interfaces/repositories/order.repository.js";

/**
 * Staff listing of every order (RF-02) with pagination and the business
 * filters (status, payment, customer, search, date window). Ownership never
 * applies here: the guard middleware already certified the staff actor.
 */
export class ListAdminOrders {
  constructor(private readonly orderReads: OrderReadRepository) {}

  async execute(
    filters: AdminOrderListFilters,
  ): Promise<OrderSummaryPage<AdminOrderSummaryRow>> {
    return this.orderReads.listAdmin(filters);
  }
}

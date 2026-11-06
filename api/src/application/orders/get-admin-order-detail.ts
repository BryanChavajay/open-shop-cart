import type {
  OrderDetailView,
  OrderHistoryEntryView,
  OrderReadRepository,
} from "../../domain/orders/interfaces/repositories/order.repository.js";
import type { OrderLineSnapshot } from "../../domain/orders/entities/order-line.entity.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface GetAdminOrderDetailQuery {
  orderPublicId: string;
}

export interface AdminOrderDetailReadModel {
  order: OrderDetailView;
  /** Frozen lines of the order, as persisted at checkout. */
  lines: OrderLineSnapshot[];
  /** State history of the order, chronologically ordered. */
  history: OrderHistoryEntryView[];
}

/**
 * Reads the full detail of any order for the staff (RF-02): no ownership
 * guard applies (the presentation guard certified the actor as staff); an
 * unknown order still answers 404.
 */
export class GetAdminOrderDetail {
  constructor(private readonly orderReads: OrderReadRepository) {}

  async execute(
    query: GetAdminOrderDetailQuery,
  ): Promise<AdminOrderDetailReadModel> {
    const detail = await this.orderReads.findDetailByPublicId(
      query.orderPublicId,
    );
    if (detail === null) {
      throw new NotFoundError(
        "Order not found",
        ErrorCode.ORDER_NOT_FOUND,
        undefined,
        undefined,
      );
    }

    const [lines, history] = await Promise.all([
      this.orderReads.listLines(detail.id),
      this.orderReads.listHistory(detail.id),
    ]);

    return { order: detail, lines, history };
  }
}

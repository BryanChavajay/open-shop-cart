import type {
  OrderDetailView,
  OrderHistoryEntryView,
  OrderReadRepository,
} from "../../domain/orders/interfaces/repositories/order.repository.js";
import type { OrderLineSnapshot } from "../../domain/orders/entities/order-line.entity.js";
import { Order } from "../../domain/checkout/entities/order.entity.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { OrderActor } from "./shared/dependencies.js";

export interface GetOwnOrderDetailQuery {
  /** Customer taken from the guarded identity, never from the URL. */
  actor: OrderActor;
  orderPublicId: string;
}

export interface OwnOrderDetailReadModel {
  order: OrderDetailView;
  /** Frozen lines of the order, as persisted at checkout. */
  lines: OrderLineSnapshot[];
  /** State history of the order, chronologically ordered. */
  history: OrderHistoryEntryView[];
}

/**
 * Reads the full detail of one order owned by the customer (RF-01). The
 * ownership rule lives in the domain: the header row is restored as an Order
 * entity and the entity decides that a foreign order answers 404
 * (ORDER_NOT_FOUND) instead of a permission error, so no other customer's
 * order existence is ever leaked.
 */
export class GetOwnOrderDetail {
  constructor(private readonly orderReads: OrderReadRepository) {}

  async execute(
    query: GetOwnOrderDetailQuery,
  ): Promise<OwnOrderDetailReadModel> {
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
    // The detail row carries every OrderSnapshot field (SP of the detail),
    // so the entity is restored straight from it for the ownership guard.
    const order = Order.restore(detail);
    order.assertOwnedBy(query.actor.id);

    const [lines, history] = await Promise.all([
      this.orderReads.listLines(order.publicId),
      this.orderReads.listHistory(order.publicId),
    ]);

    return { order: detail, lines, history };
  }
}

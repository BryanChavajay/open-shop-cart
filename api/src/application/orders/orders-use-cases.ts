import type { ListOwnOrders } from "./list-own-orders.js";
import type { GetOwnOrderDetail } from "./get-own-order-detail.js";
import type { CancelOwnOrder } from "./cancel-own-order.js";
import type { ListAdminOrders } from "./list-admin-orders.js";
import type { GetAdminOrderDetail } from "./get-admin-order-detail.js";
import type { TransitionOrderStatus } from "./transition-order-status.js";
import type { CancelOrderByStaff } from "./cancel-order-staff.js";
import type { RegisterOrderReturn } from "./register-order-return.js";

export type { OrderActor } from "./shared/dependencies.js";
export { auditEntryForOrders } from "./shared/audit.js";
export type { OrdersEntityType, OrdersAuditData } from "./shared/audit.js";

export interface OrderOwnUseCases {
  /** Customer listing of own orders (RF-01). */
  list: ListOwnOrders;
  /** Customer detail of one own order (RF-01). */
  get: GetOwnOrderDetail;
  /** Customer cancellation of one own order (RF-01). */
  cancel: CancelOwnOrder;
}

export interface OrderAdminUseCases {
  /** Staff listing with filters (RF-02). */
  list: ListAdminOrders;
  /** Staff detail of any order (RF-02). */
  get: GetAdminOrderDetail;
  /** Staff forward transition of the logistics lifecycle (RF-02). */
  transition: TransitionOrderStatus;
  /** Staff cancellation of any order (RF-02). */
  cancel: CancelOrderByStaff;
  /** Staff registration of customer returns (RF-03). */
  returns: RegisterOrderReturn;
}

/**
 * Plain grouped bag of order-management use cases (instanced by main wiring,
 * stage 5).
 */
export interface OrderUseCases {
  own: OrderOwnUseCases;
  admin: OrderAdminUseCases;
}

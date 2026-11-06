import type { CommandExecutor } from "../../../shared/interfaces/providers/sql-executor.js";
import type { OrderStatus } from "../../../checkout/enums/order-status.enum.js";
import type { PaymentMethod } from "../../../checkout/enums/payment-method.enum.js";
import type { PaymentStatus } from "../../../checkout/enums/payment-status.enum.js";
import type { OrderLineSnapshot } from "../../entities/order-line.entity.js";

export type { OrderLineSnapshot } from "../../entities/order-line.entity.js";

/**
 * Ordered order as listed for its owner (SP_Pedidos_ListarPorCliente /
 * SP_Pedidos_ListarAdmin, resumen rowset). Payment fields are null when the
 * order has no registered payment row.
 */
export interface CustomerOrderSummaryRow {
  /** Internal autoincremental identifier. */
  id: number;
  /** Public identifier (UUID v7). */
  publicId: string;
  /** Human-readable order number (ORD-YYYYMMDD-XXXX). */
  orderNumber: string;
  /** Internal id of the purchasing user. */
  userId: number;
  userPublicId: string;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  /** Frozen amounts (gross, IVA 12% included, quetzales, scale 2). */
  subtotalGross: number;
  discountTotal: number;
  shippingCost: number;
  totalNet: number;
  totalTax: number;
  totalPayable: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  updatedAt: string;
  paymentPublicId: string | null;
  /** Amount of the registered payment (it may differ from totalPayable). */
  paymentAmount: number | null;
  bankName: string | null;
  referenceNumber: string | null;
  /** Frozen aggregate: number of lines of the order. */
  totalLines: number;
  /** Frozen aggregate: number of units of the order. */
  totalUnits: number;
}

/** Same summary rowset as the customer list; no extra or optional fields. */
export type AdminOrderSummaryRow = CustomerOrderSummaryRow;

/**
 * Whole header row of one order (SP_Pedidos_ObtenerDetallePorIDPublico):
 * frozen snapshot + payment record + customer data.
 */
export interface OrderDetailView {
  id: number;
  publicId: string;
  orderNumber: string;
  userId: number;
  /** Public id of the source delivery address (ownership held at creation). */
  addressOriginPublicId: string;
  /** Internal id of the consumed inventory reservation; null when absent. */
  reservationId: number | null;
  /** Internal id of the redeemed coupon; null when no coupon was applied. */
  couponId: number | null;
  couponCode: string | null;

  // Frozen delivery snapshot at confirmation time.
  recipientFirstName: string;
  recipientLastName: string;
  deliveryPhone: string;
  deliveryDepartment: string;
  deliveryMunicipality: string;
  deliveryExactAddress: string;
  deliveryReference: string;

  // Frozen amounts.
  subtotalGross: number;
  discountTotal: number;
  shippingCost: number;
  totalNet: number;
  totalTax: number;
  totalPayable: number;

  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  updatedAt: string;

  // Payment record fields (null when no payment row exists).
  paymentPublicId: string | null;
  paymentAmount: number | null;
  bankName: string | null;
  referenceNumber: string | null;
  /** Status of the payment record itself (may trail the order status). */
  paymentRecordStatus: PaymentStatus | null;
  /** Operator who verified the payment evidence; null when unverified. */
  verifiedByUserId: number | null;
  verificationReason: string | null;
  verifiedAt: string | null;

  // Customer fields.
  userPublicId: string;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
}

/** One entry of the order state history (SP_Pedidos_HistorialListarPorID). */
export interface OrderHistoryEntryView {
  /** Status before the change; null for the initial creation entry. */
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  reason: string | null;
  /** Change timestamp (ISO). */
  occurredAt: string;
  /** Actor of the change. */
  userEmail: string;
  /** Role of the actor, persisted verbatim. */
  userRole: string;
}

/** Page of a summary listing; totalRegisters is the second SP rowset. */
export interface OrderSummaryPage<Row> {
  rows: Row[];
  totalRegisters: number;
}

/** Filters of the staff listing (SP_Pedidos_ListarAdmin). */
export interface AdminOrderListFilters {
  orderStatus?: OrderStatus;
  paymentStatus?: PaymentStatus;
  /** Exact public id of the purchasing user. */
  customerPublicId?: string;
  /** Free-text search (order number, customer e-mail). */
  search?: string;
  /** Inclusive creation-date lower bound (ISO). */
  from?: string;
  /** Inclusive creation-date upper bound (ISO). */
  to?: string;
  page: number;
  pageSize: number;
}

/** State moves of order + payment after a guarded domain transition. */
export interface ApplyOrderStatusCommand {
  orderId: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  occurredAt: string;
}

/** Persisted result of a validated line return. */
export interface ApplyOrderLineReturnCommand {
  lineId: number;
  /** Total returned units after the applied return. */
  newQuantityReturned: number;
  occurredAt: string;
}

/** Reads of the order-management module, mapped from the order SPs. */
export interface OrderReadRepository {
  /** Own orders of a customer, newest first, paginated (RF-01). */
  listByCustomer(
    customerId: number,
    query: { orderStatus?: OrderStatus; page: number; pageSize: number },
  ): Promise<OrderSummaryPage<CustomerOrderSummaryRow>>;
  /** Staff listing with pagination and business filters. */
  listAdmin(
    filters: AdminOrderListFilters,
  ): Promise<OrderSummaryPage<AdminOrderSummaryRow>>;
  /** Full header row of one order; null when it does not exist. */
  findDetailByPublicId(orderPublicId: string): Promise<OrderDetailView | null>;
  /** Frozen lines of one order already resolved by its internal id. */
  listLines(orderId: number): Promise<OrderLineSnapshot[]>;
  /** State history of one order already resolved by its internal id. */
  listHistory(orderId: number): Promise<OrderHistoryEntryView[]>;
}

/** Writes of the order-management module; all inside the caller transaction. */
export interface OrderWriteRepository {
  /** Moves order + payment states after a validated domain transition. */
  applyStatusTransition(
    executor: CommandExecutor,
    command: ApplyOrderStatusCommand,
  ): Promise<void>;
  /** Updates the returned-units count of one order line. */
  applyLineReturn(
    executor: CommandExecutor,
    command: ApplyOrderLineReturnCommand,
  ): Promise<void>;
}

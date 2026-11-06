import sql from "mssql";
import type {
  AdminOrderListFilters,
  AdminOrderSummaryRow,
  ApplyOrderLineReturnCommand,
  ApplyOrderStatusCommand,
  CustomerOrderSummaryRow,
  OrderDetailView,
  OrderHistoryEntryView,
  OrderLineSnapshot,
  OrderReadRepository,
  OrderSummaryPage,
  OrderWriteRepository,
} from "../../../../domain/orders/interfaces/repositories/order.repository.js";
import { OrderStatus } from "../../../../domain/checkout/enums/order-status.enum.js";
import { PaymentMethod } from "../../../../domain/checkout/enums/payment-method.enum.js";
import { PaymentStatus } from "../../../../domain/checkout/enums/payment-status.enum.js";
import type { CommandExecutor } from "../../../../domain/shared/interfaces/providers/sql-executor.js";
import {
  firstRow,
  parseEnum,
  readDate,
  readNumber,
  readNullableString,
  readString,
  readUuid,
} from "../mssql-helpers.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";

const PROCEDURES = {
  listByCustomer: "SP_Pedidos_ListarPorCliente",
  listAdmin: "SP_Pedidos_ListarAdmin",
  findOrderDetail: "SP_Pedidos_ObtenerDetallePorIDPublico",
  listOrderLines: "SP_Pedidos_ListarDetallePorID",
  listOrderHistory: "SP_Pedidos_HistorialListarPorID",
  updateOrderStatus: "SP_Pedidos_ActualizarEstado",
  applyLineReturn: "SP_PedidosDetalle_RegistrarDevolucionPorID",
} as const;

/** Reads a DECIMAL(10, 2) column; the driver may deliver numbers or strings. */
function readDecimal(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new TypeError(`Se esperaba número en la columna ${column}`);
}

/** Nullable DECIMAL counterpant of readDecimal (payment amount). */
function readNullableDecimal(row: SqlRow, column: string): number | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  return readDecimal(row, column);
}

/** Nullable UNIQUEIDENTIFIER column, normalized to lowercase. */
function readNullableUuid(row: SqlRow, column: string): string | null {
  if (row[column] === null) {
    return null;
  }
  return readUuid(row, column);
}

/** Reads a DATETIME2(3) column into an ISO 8601 UTC string. */
function readIsoDate(row: SqlRow, column: string): string {
  return readDate(row, column).toISOString();
}

/** Nullable DATETIME2(3) column into an ISO string or null. */
function readNullableIsoDate(row: SqlRow, column: string): string | null {
  if (row[column] === null) {
    return null;
  }
  return readIsoDate(row, column);
}

/**
 * Nullable enum column: parseEnum does not accept null, so the initial
 * history entries (EstadoAnterior null) and unverified payment records are
 * resolved before parsing.
 */
function parseEnumOrNull<T extends string>(
  enumObject: Readonly<Record<string, T>>,
  row: SqlRow,
  column: string,
): T | null {
  if (row[column] === null) {
    return null;
  }
  return parseEnum(enumObject, row[column], column);
}

/** Maps one summary row (rowset 1 of the listing procedures). */
function toOrderSummaryRow(row: SqlRow): CustomerOrderSummaryRow {
  return {
    id: readNumber(row, "IDPedido"),
    publicId: readUuid(row, "IDPublico").toLowerCase(),
    orderNumber: readString(row, "NumeroPedido"),
    userId: readNumber(row, "IDUsuario"),
    userPublicId: readUuid(row, "IDPublicoUsuario").toLowerCase(),
    userEmail: readString(row, "CorreoUsuario"),
    userFirstName: readString(row, "NombresUsuario"),
    userLastName: readString(row, "ApellidosUsuario"),
    subtotalGross: readDecimal(row, "SubtotalBruto"),
    discountTotal: readDecimal(row, "DescuentoTotal"),
    shippingCost: readDecimal(row, "CostoEnvio"),
    totalNet: readDecimal(row, "TotalNeto"),
    totalTax: readDecimal(row, "TotalIVA"),
    totalPayable: readDecimal(row, "TotalPagar"),
    orderStatus: parseEnum(
      OrderStatus,
      readString(row, "EstadoPedido"),
      "EstadoPedido",
    ),
    paymentStatus: parseEnum(
      PaymentStatus,
      readString(row, "EstadoPago"),
      "EstadoPago",
    ),
    paymentMethod: parseEnum(
      PaymentMethod,
      readString(row, "MetodoPago"),
      "MetodoPago",
    ),
    createdAt: readIsoDate(row, "FechaCreacion"),
    updatedAt: readIsoDate(row, "FechaActualizacion"),
    paymentPublicId: readNullableUuid(row, "IDPublicoPago"),
    paymentAmount: readNullableDecimal(row, "MontoPago"),
    bankName: readNullableString(row, "NombreBanco"),
    referenceNumber: readNullableString(row, "NumeroReferencia"),
    totalLines: readNumber(row, "TotalLineas"),
    totalUnits: readNumber(row, "TotalUnidades"),
  };
}

/** Maps the full header row of the order detail procedure. */
function toOrderDetailView(row: SqlRow): OrderDetailView {
  return {
    id: readNumber(row, "IDPedido"),
    publicId: readUuid(row, "IDPublico").toLowerCase(),
    orderNumber: readString(row, "NumeroPedido"),
    userId: readNumber(row, "IDUsuario"),
    addressOriginPublicId: readUuid(
      row,
      "IDDireccionOrigenPublico",
    ).toLowerCase(),
    reservationId:
      row.IDReservaInventario === null
        ? null
        : readNumber(row, "IDReservaInventario"),
    couponId: row.IDCupon === null ? null : readNumber(row, "IDCupon"),
    couponCode: readNullableString(row, "CodigoCupon"),
    recipientFirstName: readString(row, "NombresRecibe"),
    recipientLastName: readString(row, "ApellidosRecibe"),
    deliveryPhone: readString(row, "TelefonoEntrega"),
    deliveryDepartment: readString(row, "DepartamentoEntrega"),
    deliveryMunicipality: readString(row, "MunicipioEntrega"),
    deliveryExactAddress: readString(row, "DireccionExactaEntrega"),
    deliveryReference: readString(row, "ReferenciaEntrega"),
    subtotalGross: readDecimal(row, "SubtotalBruto"),
    discountTotal: readDecimal(row, "DescuentoTotal"),
    shippingCost: readDecimal(row, "CostoEnvio"),
    totalNet: readDecimal(row, "TotalNeto"),
    totalTax: readDecimal(row, "TotalIVA"),
    totalPayable: readDecimal(row, "TotalPagar"),
    orderStatus: parseEnum(
      OrderStatus,
      readString(row, "EstadoPedido"),
      "EstadoPedido",
    ),
    paymentStatus: parseEnum(
      PaymentStatus,
      readString(row, "EstadoPago"),
      "EstadoPago",
    ),
    paymentMethod: parseEnum(
      PaymentMethod,
      readString(row, "MetodoPago"),
      "MetodoPago",
    ),
    createdAt: readIsoDate(row, "FechaCreacion"),
    updatedAt: readIsoDate(row, "FechaActualizacion"),
    paymentPublicId: readNullableUuid(row, "IDPublicoPago"),
    paymentAmount: readNullableDecimal(row, "MontoPago"),
    bankName: readNullableString(row, "NombreBanco"),
    referenceNumber: readNullableString(row, "NumeroReferencia"),
    paymentRecordStatus: parseEnumOrNull<PaymentStatus>(
      PaymentStatus,
      row,
      "EstadoPagoPago",
    ),
    verifiedByUserId:
      row.IDUsuarioVerificador === null
        ? null
        : readNumber(row, "IDUsuarioVerificador"),
    verificationReason: readNullableString(row, "MotivoVerificacion"),
    verifiedAt: readNullableIsoDate(row, "FechaVerificacion"),
    userPublicId: readUuid(row, "IDPublicoUsuario").toLowerCase(),
    userEmail: readString(row, "CorreoUsuario"),
    userFirstName: readString(row, "NombresUsuario"),
    userLastName: readString(row, "ApellidosUsuario"),
  };
}

/** Maps one frozen line row (SP_Pedidos_ListarDetallePorID). */
function toOrderLineSnapshot(row: SqlRow): OrderLineSnapshot {
  return {
    lineId: readNumber(row, "IDPedidoDetalle"),
    linePublicId: readUuid(row, "IDPublico").toLowerCase(),
    variantId: readNumber(row, "IDVariante"),
    variantPublicId: readUuid(row, "IDPublicoVariante").toLowerCase(),
    sku: readString(row, "SKU"),
    productName: readString(row, "NombreProducto"),
    variantName: readString(row, "NombreVariante"),
    quantity: readNumber(row, "Cantidad"),
    quantityReturned: readNumber(row, "CantidadDevuelta"),
    unitPriceNet: readDecimal(row, "PrecioUnitarioNeto"),
    unitPriceGross: readDecimal(row, "PrecioUnitarioBruto"),
    subtotalGross: readDecimal(row, "SubtotalBruto"),
    discountGross: readDecimal(row, "DescuentoLinea"),
    totalGross: readDecimal(row, "TotalLineaBruto"),
  };
}

/** Maps one history row (SP_Pedidos_HistorialListarPorID). */
function toOrderHistoryEntryView(row: SqlRow): OrderHistoryEntryView {
  return {
    previousStatus: parseEnumOrNull<OrderStatus>(
      OrderStatus,
      row,
      "EstadoAnterior",
    ),
    newStatus: parseEnum(
      OrderStatus,
      readString(row, "EstadoNuevo"),
      "EstadoNuevo",
    ),
    reason: readNullableString(row, "Motivo"),
    occurredAt: readIsoDate(row, "FechaCambio"),
    userEmail: readString(row, "CorreoUsuario"),
    userRole: readString(row, "RolUsuario"),
  };
}

/**
 * Order-management persistence on SQL Server through stored procedures (the
 * order module reads and writes; checkout owns the creation writes). Read
 * methods run on the executor provided to the constructor. The two listing
 * procedures return two rowsets: [0] page rows, [1] TotalRegistros. Write
 * procedures are pure UPDATEs guarded by the domain entity and run inside
 * the use-case transaction (`CommandExecutor`).
 */
export class MssqlOrderRepository
  implements OrderReadRepository, OrderWriteRepository
{
  constructor(private readonly executor: SqlExecutor) {}

  async listByCustomer(
    customerId: number,
    query: { orderStatus?: OrderStatus; page: number; pageSize: number },
  ): Promise<OrderSummaryPage<CustomerOrderSummaryRow>> {
    const result = await this.executor.execute(PROCEDURES.listByCustomer, [
      { name: "IDUsuario", type: sql.Int, value: customerId },
      {
        name: "EstadoPedido",
        type: sql.NVarChar(40),
        value: query.orderStatus ?? null,
      },
      { name: "Pagina", type: sql.Int, value: query.page },
      { name: "TamanoPagina", type: sql.Int, value: query.pageSize },
    ]);
    return this.toSummaryPage(result, (row) => toOrderSummaryRow(row));
  }

  async listAdmin(
    filters: AdminOrderListFilters,
  ): Promise<OrderSummaryPage<AdminOrderSummaryRow>> {
    const result = await this.executor.execute(PROCEDURES.listAdmin, [
      {
        name: "EstadoPedido",
        type: sql.NVarChar(40),
        value: filters.orderStatus ?? null,
      },
      {
        name: "EstadoPago",
        type: sql.NVarChar(40),
        value: filters.paymentStatus ?? null,
      },
      {
        name: "IDPublicoUsuario",
        type: sql.UniqueIdentifier,
        value: filters.customerPublicId ?? null,
      },
      {
        name: "Busqueda",
        type: sql.NVarChar(254),
        value: filters.search ?? null,
      },
      {
        name: "FechaDesde",
        type: sql.DateTime2(3),
        value: filters.from === undefined ? null : new Date(filters.from),
      },
      {
        name: "FechaHasta",
        type: sql.DateTime2(3),
        value: filters.to === undefined ? null : new Date(filters.to),
      },
      { name: "Pagina", type: sql.Int, value: filters.page },
      { name: "TamanoPagina", type: sql.Int, value: filters.pageSize },
    ]);
    return this.toSummaryPage(result, (row) => toOrderSummaryRow(row));
  }

  async findDetailByPublicId(
    orderPublicId: string,
  ): Promise<OrderDetailView | null> {
    const result = await this.executor.execute(PROCEDURES.findOrderDetail, [
      {
        name: "IDPublico",
        type: sql.UniqueIdentifier,
        value: orderPublicId,
      },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      return null;
    }
    return toOrderDetailView(row);
  }

  async listLines(orderId: number): Promise<OrderLineSnapshot[]> {
    const result = await this.executor.execute(PROCEDURES.listOrderLines, [
      {
        name: "IDPedido",
        type: sql.Int,
        value: orderId,
      },
    ]);
    return (result.recordset ?? []).map(toOrderLineSnapshot);
  }

  async listHistory(orderId: number): Promise<OrderHistoryEntryView[]> {
    const result = await this.executor.execute(PROCEDURES.listOrderHistory, [
      {
        name: "IDPedido",
        type: sql.Int,
        value: orderId,
      },
    ]);
    return (result.recordset ?? []).map(toOrderHistoryEntryView);
  }

  async applyStatusTransition(
    executor: CommandExecutor,
    command: ApplyOrderStatusCommand,
  ): Promise<void> {
    await executor.execute(PROCEDURES.updateOrderStatus, [
      { name: "IDPedido", type: sql.Int, value: command.orderId },
      {
        name: "EstadoPedido",
        type: sql.NVarChar(40),
        value: command.orderStatus,
      },
      {
        name: "EstadoPago",
        type: sql.NVarChar(40),
        value: command.paymentStatus,
      },
      {
        name: "FechaActualizacion",
        type: sql.DateTime2(3),
        value: new Date(command.occurredAt),
      },
    ]);
  }

  async applyLineReturn(
    executor: CommandExecutor,
    command: ApplyOrderLineReturnCommand,
  ): Promise<void> {
    await executor.execute(PROCEDURES.applyLineReturn, [
      {
        name: "IDPedidoDetalle",
        type: sql.Int,
        value: command.lineId,
      },
      {
        name: "NuevaCantidadDevuelta",
        type: sql.Int,
        value: command.newQuantityReturned,
      },
      {
        name: "FechaActualizacion",
        type: sql.DateTime2(3),
        value: new Date(command.occurredAt),
      },
    ]);
  }

  /** Joins both rowsets of the listing procedures into the page contract. */
  private toSummaryPage(
    result: { recordsets: readonly SqlRow[][] },
    toRow: (row: SqlRow) => CustomerOrderSummaryRow,
  ): OrderSummaryPage<CustomerOrderSummaryRow> {
    const rows = (result.recordsets[0] ?? []).map(toRow);
    const totalRow = firstRow(result.recordsets[1]);
    const totalRegisters =
      totalRow === null ? rows.length : readNumber(totalRow, "TotalRegistros");
    return { rows, totalRegisters };
  }
}

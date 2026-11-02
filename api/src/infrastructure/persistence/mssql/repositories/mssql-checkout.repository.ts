import sql from "mssql";
import type { OrderSnapshot } from "../../../../domain/checkout/entities/order.entity.js";
import type {
  ApplyPaymentVerificationCommand,
  CheckoutOperationRecord,
  CheckoutReadRepository,
  CheckoutLinePayload,
  CheckoutWriteRepository,
  NewOrderLineData,
  NewPaymentData,
  OrderHistoryEntryData,
  OrderLineRow,
  OrderVerificationRow,
  QuotedVariant,
  SaveCheckoutOperationCommand,
} from "../../../../domain/checkout/interfaces/repositories/checkout.repository.js";
import { OrderStatus } from "../../../../domain/checkout/enums/order-status.enum.js";
import { PaymentMethod } from "../../../../domain/checkout/enums/payment-method.enum.js";
import { PaymentStatus } from "../../../../domain/checkout/enums/payment-status.enum.js";
import type { CommandExecutor } from "../../../../domain/shared/interfaces/providers/sql-executor.js";
import { ConflictError } from "../../../../domain/shared/errors/conflict-error.js";
import { NotFoundError } from "../../../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../../../domain/shared/enums/error-code.enum.js";
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

/** Reads a BIT/CASE-0-1 column into a boolean. */
function readBitLike(row: SqlRow, column: string): boolean {
  const value = row[column];
  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0) {
    return false;
  }
  throw new TypeError(`Se esperaba booleano en la columna ${column}`);
}

/** Reads a DATETIME2(3) column into an ISO 8601 UTC string. */
function readIsoDate(row: SqlRow, column: string): string {
  return readDate(row, column).toISOString();
}

const PROCEDURES = {
  quoteVariants: "SP_Checkout_VariantesObtenerParaCotizar",
  findOperation: "SP_Checkout_OperacionObtener",
  saveOperation: "SP_Checkout_OperacionGuardar",
  insertOrder: "SP_Pedidos_Crear",
  insertOrderLine: "SP_Pedidos_DetalleAgregar",
  insertPayment: "SP_Pedidos_PagoRegistrar",
  appendHistory: "SP_Pedidos_HistorialAgregar",
  findOrderForVerification: "SP_Pedidos_ObtenerBloquearParaVerificarPago",
  listOrderLines: "SP_Pedidos_DetalleListar",
  applyVerification: "SP_Pedidos_ActualizarVerificacionPago",
  findOrderPublic: "SP_Pedidos_ObtenerPorIDPublico",
} as const;

/** THROW numbers raised by the checkout/orders procedures (range 50550..50560, migration 010). */
const THROW_ADDRESS_NOT_OWNED = 50553;
const THROW_DUPLICATE_ORDER_NUMBER = 50554;

/**
 * Translates the procedure-level THROW numbers of checkout into domain
 * errors: a foreign/missing address (checked again inside SP_Pedidos_Crear)
 * surfaces as the same ADDRESS_NOT_FOUND 404 and a lost order-number race as
 * a DuplicateKeyError-like conflict.
 */
function mapCheckoutThrow(error: unknown): unknown {
  if (!(error instanceof sql.RequestError) || error.number === undefined) {
    return error;
  }
  switch (error.number) {
    case THROW_ADDRESS_NOT_OWNED:
      return new NotFoundError(
        "Address not found",
        ErrorCode.ADDRESS_NOT_FOUND,
        undefined,
        undefined,
      );
    case THROW_DUPLICATE_ORDER_NUMBER:
      return new ConflictError(
        "The order number already exists",
        ErrorCode.CONCURRENT_MODIFICATION,
        undefined,
        undefined,
      );
    default:
      return error;
  }
}
void mapCheckoutThrow;

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

function toQuotedVariant(row: SqlRow): QuotedVariant {
  return {
    variantId: readNumber(row, "IDVariante"),
    variantPublicId: readUuid(row, "IDPublico").toLowerCase(),
    sku: readString(row, "SKU"),
    productName: readString(row, "NombreProducto"),
    variantName: readString(row, "NombreVariante"),
    netUnitPrice: readDecimal(row, "PrecioUnitario"),
    productActive: readBitLike(row, "ActivoProducto"),
    variantActive: readBitLike(row, "ActivoVariante"),
    variantDeleted: readBitLike(row, "EliminadoVariante"),
    physicalStock: readNumber(row, "ExistenciaFisica"),
    categoryPublicId: readUuid(row, "IDPublicoCategoria").toLowerCase(),
    categoryName: readString(row, "NombreCategoria"),
    requestedQuantity: readNumber(row, "CantidadSolicitada"),
  };
}

function toOrderLineRow(row: SqlRow): OrderLineRow {
  return {
    linePublicId: readUuid(row, "IDPublico"),
    variantPublicId: readString(row, "IDPublicoVariante").toLowerCase(),
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

/**
 * Checkout/order persistence on SQL Server through stored procedures. Write
 * methods receive the use-case `CommandExecutor` (UnitOfWork transaction);
 * read methods run on the executor provided to the constructor unless they
 * must join a transaction. Procedures never open transactions.
 */
export class MssqlCheckoutRepository
  implements CheckoutReadRepository, CheckoutWriteRepository
{
  constructor(private readonly executor: SqlExecutor) {}

  async quoteVariants(
    lines: readonly CheckoutLinePayload[],
  ): Promise<QuotedVariant[]> {
    const payload = JSON.stringify(
      lines.map((line) => ({
        idPublico: line.variantPublicId,
        cantidad: line.quantity,
      })),
    );
    const result = await this.executor.execute(PROCEDURES.quoteVariants, [
      { name: "JSONLineas", type: sql.NVarChar(sql.MAX), value: payload },
    ]);
    return (result.recordset ?? []).map(toQuotedVariant);
  }

  async findOperation(
    customerId: number,
    idempotencyKey: string,
  ): Promise<CheckoutOperationRecord | null> {
    const result = await this.executor.execute(PROCEDURES.findOperation, [
      { name: "IDUsuario", type: sql.Int, value: customerId },
      {
        name: "ClaveIdempotencia",
        type: sql.NVarChar(100),
        value: idempotencyKey,
      },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      return null;
    }
    return {
      fingerprint: readString(row, "HuellaCanonica"),
      orderId: readNumber(row, "IDPedido"),
      orderPublicId: readUuid(row, "IDPublicoPedido").toLowerCase(),
    };
  }

  async findOrderRow(
    executor: CommandExecutor,
    context: { orderPublicId: string; customerId: number },
  ): Promise<OrderVerificationRow | null> {
    const result = await executor.execute(PROCEDURES.findOrderPublic, [
      {
        name: "IDPublico",
        type: sql.UniqueIdentifier,
        value: context.orderPublicId,
      },
      { name: "IDUsuario", type: sql.Int, value: context.customerId },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      return null;
    }
    return this.toVerificationRow(row);
  }

  async findOrderForVerification(
    orderPublicId: string,
  ): Promise<OrderVerificationRow | null> {
    const result = await this.executor.execute(
      PROCEDURES.findOrderForVerification,
      [{ name: "IDPublico", type: sql.UniqueIdentifier, value: orderPublicId }],
    );
    const row = firstRow(result.recordset);
    if (row === null) {
      return null;
    }
    return this.toVerificationRow(row);
  }

  async findOrderSnapshotLocked(
    executor: CommandExecutor,
    orderPublicId: string,
  ): Promise<OrderSnapshot | null> {
    // The locked verification read also carries the frozen delivery snapshot,
    // so the row is wide enough for a full OrderSnapshot.
    const result = await executor.execute(PROCEDURES.findOrderForVerification, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: orderPublicId },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      return null;
    }
    return this.toOrderSnapshot(row);
  }

  async listOrderLines(
    executor: CommandExecutor,
    orderPublicId: string,
  ): Promise<OrderLineRow[]> {
    const result = await executor.execute(PROCEDURES.listOrderLines, [
      {
        name: "IDPublicoPedido",
        type: sql.UniqueIdentifier,
        value: orderPublicId,
      },
    ]);
    return (result.recordset ?? []).map(toOrderLineRow);
  }

  async saveOperation(
    executor: CommandExecutor,
    command: SaveCheckoutOperationCommand,
  ): Promise<void> {
    await executor.execute(PROCEDURES.saveOperation, [
      { name: "IDUsuario", type: sql.Int, value: command.customerId },
      {
        name: "ClaveIdempotencia",
        type: sql.NVarChar(100),
        value: command.idempotencyKey,
      },
      {
        name: "HuellaCanonica",
        type: sql.NVarChar(64),
        value: command.fingerprint,
      },
      { name: "IDPedido", type: sql.Int, value: command.orderId },
    ]);
  }

  async insertOrder(
    executor: CommandExecutor,
    snapshot: OrderSnapshot,
  ): Promise<number> {
    const result = await executor
      .execute(PROCEDURES.insertOrder, [
        {
          name: "IDPublico",
          type: sql.UniqueIdentifier,
          value: snapshot.publicId,
        },
        {
          name: "NumeroPedido",
          type: sql.NVarChar(30),
          value: snapshot.orderNumber,
        },
        { name: "IDUsuario", type: sql.Int, value: snapshot.userId },
        {
          name: "IDPublicoDireccion",
          type: sql.UniqueIdentifier,
          value: snapshot.addressOriginPublicId,
        },
        {
          name: "IDReservaInventario",
          type: sql.Int,
          value: snapshot.reservationId,
        },
        { name: "IDCupon", type: sql.Int, value: snapshot.couponId },
        {
          name: "CodigoCupon",
          type: sql.NVarChar(64),
          value: snapshot.couponCode,
        },
        {
          name: "NombresRecibe",
          type: sql.NVarChar(100),
          value: snapshot.recipientFirstName,
        },
        {
          name: "ApellidosRecibe",
          type: sql.NVarChar(100),
          value: snapshot.recipientLastName,
        },
        {
          name: "TelefonoEntrega",
          type: sql.NVarChar(20),
          value: snapshot.deliveryPhone,
        },
        {
          name: "DepartamentoEntrega",
          type: sql.NVarChar(100),
          value: snapshot.deliveryDepartment,
        },
        {
          name: "MunicipioEntrega",
          type: sql.NVarChar(100),
          value: snapshot.deliveryMunicipality,
        },
        {
          name: "DireccionExactaEntrega",
          type: sql.NVarChar(300),
          value: snapshot.deliveryExactAddress,
        },
        {
          name: "ReferenciaEntrega",
          type: sql.NVarChar(300),
          value: snapshot.deliveryReference,
        },
        {
          name: "SubtotalBruto",
          type: sql.Decimal(10, 2),
          value: snapshot.subtotalGross,
        },
        {
          name: "DescuentoTotal",
          type: sql.Decimal(10, 2),
          value: snapshot.discountTotal,
        },
        {
          name: "CostoEnvio",
          type: sql.Decimal(10, 2),
          value: snapshot.shippingCost,
        },
        {
          name: "TotalNeto",
          type: sql.Decimal(10, 2),
          value: snapshot.totalNet,
        },
        {
          name: "TotalIVA",
          type: sql.Decimal(10, 2),
          value: snapshot.totalTax,
        },
        {
          name: "TotalPagar",
          type: sql.Decimal(10, 2),
          value: snapshot.totalPayable,
        },
        {
          name: "EstadoPedido",
          type: sql.NVarChar(40),
          value: snapshot.orderStatus,
        },
        {
          name: "EstadoPago",
          type: sql.NVarChar(40),
          value: snapshot.paymentStatus,
        },
        {
          name: "MetodoPago",
          type: sql.NVarChar(30),
          value: snapshot.paymentMethod,
        },
      ])
      .catch((error: unknown) => {
        throw mapCheckoutThrow(error);
      });
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new Error("El procedimiento de pedidos no devolvio filas");
    }
    return readNumber(row, "IDPedido");
  }

  async insertOrderLine(
    executor: CommandExecutor,
    line: NewOrderLineData,
  ): Promise<void> {
    await executor.execute(PROCEDURES.insertOrderLine, [
      {
        name: "IDPublicoDetalle",
        type: sql.UniqueIdentifier,
        value: line.publicId,
      },
      { name: "IDPedido", type: sql.Int, value: line.orderId },
      { name: "IDVariante", type: sql.Int, value: line.variantId },
      { name: "SKU", type: sql.NVarChar(64), value: line.sku },
      {
        name: "NombreProducto",
        type: sql.NVarChar(200),
        value: line.productName,
      },
      {
        name: "NombreVariante",
        type: sql.NVarChar(100),
        value: line.variantName,
      },
      { name: "Cantidad", type: sql.Int, value: line.quantity },
      {
        name: "PrecioUnitarioNeto",
        type: sql.Decimal(10, 2),
        value: line.unitPriceNet,
      },
      {
        name: "PrecioUnitarioBruto",
        type: sql.Decimal(10, 2),
        value: line.unitPriceGross,
      },
      {
        name: "SubtotalBruto",
        type: sql.Decimal(10, 2),
        value: line.subtotalGross,
      },
      {
        name: "DescuentoLinea",
        type: sql.Decimal(10, 2),
        value: line.discountGross,
      },
      {
        name: "TotalLineaBruto",
        type: sql.Decimal(10, 2),
        value: line.totalGross,
      },
    ]);
  }

  async insertPayment(
    executor: CommandExecutor,
    payment: NewPaymentData,
  ): Promise<void> {
    await executor.execute(PROCEDURES.insertPayment, [
      {
        name: "IDPublico",
        type: sql.UniqueIdentifier,
        value: payment.publicId,
      },
      { name: "IDPedido", type: sql.Int, value: payment.orderId },
      { name: "MetodoPago", type: sql.NVarChar(30), value: payment.method },
      { name: "EstadoPago", type: sql.NVarChar(40), value: payment.status },
      { name: "Monto", type: sql.Decimal(10, 2), value: payment.amount },
      { name: "NombreBanco", type: sql.NVarChar(100), value: payment.bankName },
      {
        name: "NumeroReferencia",
        type: sql.NVarChar(100),
        value: payment.referenceNumber,
      },
      {
        name: "DatosProveedor",
        type: sql.NVarChar(sql.MAX),
        value: payment.providerData,
      },
    ]);
  }

  async appendOrderHistory(
    executor: CommandExecutor,
    entry: OrderHistoryEntryData,
  ): Promise<void> {
    await executor.execute(PROCEDURES.appendHistory, [
      { name: "IDPedido", type: sql.Int, value: entry.orderId },
      {
        name: "EstadoAnterior",
        type: sql.NVarChar(40),
        value: entry.previousStatus,
      },
      { name: "EstadoNuevo", type: sql.NVarChar(40), value: entry.newStatus },
      { name: "IDUsuario", type: sql.Int, value: entry.userId },
      { name: "Motivo", type: sql.NVarChar(300), value: entry.reason },
      { name: "FechaCambio", type: sql.DateTime2(3), value: entry.occurredAt },
    ]);
  }

  async applyPaymentVerification(
    executor: CommandExecutor,
    command: ApplyPaymentVerificationCommand,
  ): Promise<void> {
    await executor.execute(PROCEDURES.applyVerification, [
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
        name: "IDUsuarioVerificador",
        type: sql.Int,
        value: command.verifiedByUserId,
      },
      {
        name: "MotivoVerificacion",
        type: sql.NVarChar(300),
        value: command.reason,
      },
      {
        name: "FechaVerificacion",
        type: sql.DateTime2(3),
        value: command.occurredAt,
      },
      {
        name: "NumeroReferencia",
        type: sql.NVarChar(100),
        value: command.referenceNumber,
      },
      {
        name: "DatosProveedor",
        type: sql.NVarChar(sql.MAX),
        value: command.providerData,
      },
    ]);
  }

  /** Maps one order+payment row into the read model. */
  private toVerificationRow(row: SqlRow): OrderVerificationRow {
    return {
      id: readNumber(row, "IDPedido"),
      publicId: readUuid(row, "IDPublico").toLowerCase(),
      orderNumber: readString(row, "NumeroPedido"),
      createdAt: readIsoDate(row, "FechaCreacion"),
      updatedAt: readIsoDate(row, "FechaActualizacion"),
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
    };
  }

  /** Maps one locked order+payment row into the full entity snapshot. */
  private toOrderSnapshot(row: SqlRow): OrderSnapshot {
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
    };
  }
}

import sql from "mssql";
import { StockMovementType } from "../../../../domain/inventory/enums/stock-movement-type.enum.js";
import { StockReservationStatus } from "../../../../domain/inventory/enums/reservation-status.enum.js";
import type {
  IdempotencyOperationData,
  InventoryListFilter,
  InventoryReadRepository,
  InventoryWriteRepository,
  MovementListFilter,
} from "../../../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { ReservationHistorySnapshot } from "../../../../domain/inventory/entities/reservation-history.entity.js";
import type { StockBalanceSnapshot } from "../../../../domain/inventory/entities/stock-balance.entity.js";
import type { StockMovementSnapshot } from "../../../../domain/inventory/entities/inventory-movement.entity.js";
import type { StockReservationSnapshot } from "../../../../domain/inventory/entities/stock-reservation.entity.js";
import type { InventoryMovementReadModel } from "../../../../domain/inventory/readmodels/inventory-movement.read-model.js";
import type { InventoryListItemReadModel } from "../../../../domain/inventory/readmodels/inventory-list-item.read-model.js";
import type { PaginatedReadModel } from "../../../../domain/shared/readmodels/paginated.read-model.js";
import type { CommandExecutor } from "../../../../domain/shared/interfaces/providers/sql-executor.js";
import {
  firstRow,
  parseEnum,
  readBoolean,
  readNullableString,
  readNumber,
  readString,
  readUuid,
} from "../mssql-helpers.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";

const PROCEDURES = {
  applyPhysicalStockChange: "SP_Inventario_VarianteActualizarExistencia",
  insertMovement: "SP_Inventario_MovimientoAgregar",
  findSaleMovementByOrderAndVariant:
    "SP_Inventario_MovimientoVentaObtenerPorPedidoYVariante",
  sumReintegrated: "SP_Inventario_MovimientosSumarReintegrados",
  findBalanceByPublicId: "SP_Inventario_SaldoObtenerPorVariante",
  fetchLockedBalances: "SP_Inventario_SaldosBloquearDeVariantes",
  sumActiveReserved: "SP_Inventario_ReservasSumarActivasDeVariantes",
  hasStockOrActiveReservations:
    "SP_Inventario_VariantesConSaldoOReservasBloquear",
  createReservation: "SP_Inventario_ReservasCrear",
  findReservationByPublicId: "SP_Inventario_ReservasObtenerPorIDPublico",
  fetchActiveReservation: "SP_Inventario_ReservasObtenerBloquearActiva",
  fetchLockedReservation: "SP_Inventario_ReservasObtenerBloquearEstado",
  fetchLockedReservationById:
    "SP_Inventario_ReservasObtenerBloquearEstadoPorID",
  findReservationBySourceReference:
    "SP_Inventario_ReservasObtenerPorReferencia",
  updateReservationStatus: "SP_Inventario_ReservasEstadoActualizar",
  insertReservationHistory: "SP_Inventario_HistoriaReservaAgregar",
  listExpiredReservations: "SP_Inventario_ReservasListarVencidas",
  listInventory: "SP_Inventario_SaldosListar",
  listMovements: "SP_Inventario_MovimientosListarDeVariante",
  saveOperation: "SP_Inventario_OperacionesGuardar",
  findOperation: "SP_Inventario_OperacionesObtener",
} as const;

/** Reads a DATETIME2 column exposed as a JS `Date` by the driver into ISO 8601 UTC string. */
function readIsoDate(row: SqlRow, column: string): string {
  const value = row[column];
  if (value instanceof Date) {
    return value.toISOString();
  }
  throw new TypeError(`Se esperaba fecha en la columna ${column}`);
}

function readOptionalNullableNumber(row: SqlRow, column: string): number | null {
  if (!(column in row) || row[column] === null) return null;
  return readNumber(row, column);
}

function toBalanceState(row: SqlRow): StockBalanceSnapshot {
  return {
    variantId: readNumber(row, "IDVariante"),
    variantPublicId: readUuid(row, "IDPublicoVariante"),
    sku: readString(row, "SKU"),
    productName: readString(row, "NombreProducto"),
    productId: readNumber(row, "IDProducto"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
    physicalQuantity: readNumber(row, "ExistenciaFisica"),
    reservedQuantity: readNumber(row, "ExistenciaReservada"),
    availableQuantity: readNumber(row, "ExistenciaDisponible"),
    updatedAt: readIsoDate(row, "FechaActualizacion"),
  };
}

function toMovementState(row: SqlRow): StockMovementSnapshot {
  return {
    id: readNumber(row, "IDMovimiento"),
    publicId: readUuid(row, "IDPublicoMovimiento"),
    variantId: readNumber(row, "IDVariante"),
    variantPublicId: readUuid(row, "IDPublicoVariante"),
    movementType: parseEnum(
      StockMovementType,
      readString(row, "TipoMovimiento"),
      "TipoMovimiento",
    ),
    quantityDelta: readNumber(row, "CantidadDiferencial"),
    balanceBefore: readNumber(row, "SaldoAnterior"),
    balanceAfter: readNumber(row, "SaldoPosterior"),
    userId: readNumber(row, "IDUsuario"),
    reason: readString(row, "Motivo"),
    sourceReference: readNullableString(row, "ReferenciaOrigen"),
    orderId: readOptionalNullableNumber(row, "IDPedido"),
    relatedSaleMovementId: readOptionalNullableNumber(
      row,
      "IDMovimientoVentaRelacionado",
    ),
    relatedSalePublicId: readNullableString(row, "IDPublicoVentaRelacionada"),
    createdAt: readIsoDate(row, "FechaRegistro"),
  };
}

function toMovementRead(row: SqlRow): InventoryMovementReadModel {
  return {
    publicId: readUuid(row, "IDPublicoMovimiento"),
    variantPublicId: readUuid(row, "IDPublicoVariante"),
    movementType: parseEnum(
      StockMovementType,
      readString(row, "TipoMovimiento"),
      "TipoMovimiento",
    ),
    quantityDelta: readNumber(row, "CantidadDiferencial"),
    balanceBefore: readNumber(row, "SaldoAnterior"),
    balanceAfter: readNumber(row, "SaldoPosterior"),
    reason: readString(row, "Motivo"),
    sourceReference: readNullableString(row, "ReferenciaOrigen"),
    relatedSalePublicId: readNullableString(row, "IDPublicoVentaRelacionada"),
    userPublicId: readUuid(row, "UsuarioIDPublico"),
    userName: `${readString(row, "Nombres")} ${readString(row, "Apellidos")}`,
    createdAt: readIsoDate(row, "FechaRegistro"),
  };
}

function toListItem(row: SqlRow): InventoryListItemReadModel {
  return {
    variantPublicId: readUuid(row, "IDPublicoVariante"),
    sku: readString(row, "SKU"),
    productName: readString(row, "NombreProducto"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
    physicalQuantity: readNumber(row, "ExistenciaFisica"),
    reservedQuantity: readNumber(row, "ExistenciaReservada"),
    availableQuantity: readNumber(row, "ExistenciaDisponible"),
    updatedAt: readIsoDate(row, "FechaActualizacion"),
  };
}

/** Assembles a reservation snapshot from its header row and line rows. */
function toReservationState(
  header: SqlRow,
  lineRows: SqlRow[],
): StockReservationSnapshot {
  return {
    id: readNumber(header, "IDReserva"),
    publicId: readUuid(header, "IDPublicoReserva"),
    sourceReference: readString(header, "ReferenciaOrigen"),
    userId: readNumber(header, "IDUsuario"),
    status: parseEnum(
      StockReservationStatus,
      readString(header, "Estado"),
      "Estado",
    ),
    createdAt: readIsoDate(header, "FechaCreacion"),
    expiresAt: readIsoDate(header, "FechaVencimiento"),
    lines: lineRows.map((row) => ({
      publicId: readUuid(row, "IDPublicoDetalle"),
      variantId: readNumber(row, "IDVariante"),
      variantPublicId: readUuid(row, "IDPublicoVariante"),
      quantity: readNumber(row, "Cantidad"),
    })),
  };
}

/** Two-recordset reservation read: [0] header, [1] lines. */
function toReservationFromRecordsets(
  headerRows: SqlRow[] | undefined,
  lineRows: SqlRow[] | undefined,
): StockReservationSnapshot | null {
  const header = firstRow(headerRows);
  if (header === null) return null;
  return toReservationState(header, lineRows ?? []);
}

function toOperationData(row: SqlRow): IdempotencyOperationData {
  return {
    operationType: readString(row, "TipoOperacion"),
    idempotencyKey: readString(row, "ClaveIdempotencia"),
    fingerprint: readString(row, "HuellaSolicitud"),
    resultPublicId: readNullableString(row, "IDPublicoResultado"),
    variantPublicId: readNullableString(row, "IDPublicoVariante"),
    userId: readNumber(row, "IDUsuario"),
  };
}

/** Builds the paginated result exactly like the rest of the repositories. */
function toPaginated<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): PaginatedReadModel<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0,
  };
}

/** Builds the two-recordset pagination shape used by the listing procedures. */
function toTwoRecordsetPagination(
  countRecordset: SqlRow[] | undefined,
  pageRecordset: SqlRow[] | undefined,
): { totalItems: number; pageRows: SqlRow[] } {
  const countRow = firstRow(countRecordset);
  return {
    totalItems: countRow === null ? 0 : readNumber(countRow, "TotalFilas"),
    pageRows: pageRecordset ?? [],
  };
}

/** Comma-joins a public/internal id list for the STRING_SPLIT procedures. */
function joinIds(ids: readonly (string | number)[]): string {
  return ids.map((id) => String(id)).join(",");
}

/**
 * Inventory persistence on SQL Server through stored procedures.
 *
 * Write methods and locked reads run inside the use-case `CommandExecutor`
 * (transaction); plain reads run on the executor provided to the constructor.
 */
export class MssqlInventoryRepository
  implements InventoryWriteRepository, InventoryReadRepository
{
  constructor(private readonly executor: SqlExecutor) {}

  withExecutor(executor: CommandExecutor): InventoryReadRepository {
    return new MssqlInventoryRepository(executor);
  }

  async applyPhysicalStockChange(
    executor: CommandExecutor,
    variantInternalId: number,
    quantityDelta: number,
  ): Promise<void> {
    await executor.execute(PROCEDURES.applyPhysicalStockChange, [
      { name: "IDVariante", type: sql.Int, value: variantInternalId },
      { name: "CantidadDiferencial", type: sql.Int, value: quantityDelta },
    ]);
  }

  async insertMovement(
    executor: CommandExecutor,
    movement: StockMovementSnapshot,
  ): Promise<number> {
    const result = await executor.execute(PROCEDURES.insertMovement, [
      {
        name: "IDPublico",
        type: sql.UniqueIdentifier,
        value: movement.publicId,
      },
      { name: "IDVariante", type: sql.Int, value: movement.variantId },
      {
        name: "TipoMovimiento",
        type: sql.NVarChar(30),
        value: movement.movementType,
      },
      {
        name: "CantidadDiferencial",
        type: sql.Int,
        value: movement.quantityDelta,
      },
      { name: "SaldoAnterior", type: sql.Int, value: movement.balanceBefore },
      { name: "SaldoPosterior", type: sql.Int, value: movement.balanceAfter },
      { name: "IDUsuario", type: sql.Int, value: movement.userId },
      { name: "Motivo", type: sql.NVarChar(200), value: movement.reason },
      {
        name: "ReferenciaOrigen",
        type: sql.NVarChar(100),
        value: movement.sourceReference,
      },
      {
        name: "IDPedido",
        type: sql.Int,
        value: movement.orderId ?? null,
      },
      {
        name: "IDMovimientoVentaRelacionado",
        type: sql.BigInt,
        value: movement.relatedSaleMovementId ?? null,
      },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new Error("El procedimiento de movimiento no devolvió filas");
    }
    return readNumber(row, "IDMovimiento");
  }

  async insertReservation(
    executor: CommandExecutor,
    reservation: StockReservationSnapshot,
  ): Promise<number> {
    // One JSON line per reservation line; the pricing of duplicates and unknown
    // variants is enforced by the procedure.
    const details = JSON.stringify(
      reservation.lines.map((line) => ({
        IDPublico: line.publicId,
        IDPublicoVariante: line.variantPublicId,
        Cantidad: line.quantity,
      })),
    );
    const result = await executor.execute(PROCEDURES.createReservation, [
      {
        name: "IDPublico",
        type: sql.UniqueIdentifier,
        value: reservation.publicId,
      },
      {
        name: "ReferenciaOrigen",
        type: sql.NVarChar(100),
        value: reservation.sourceReference,
      },
      { name: "IDUsuario", type: sql.Int, value: reservation.userId },
      {
        name: "FechaCreacion",
        type: sql.DateTime2(3),
        value: reservation.createdAt,
      },
      {
        name: "FechaVencimiento",
        type: sql.DateTime2(3),
        value: reservation.expiresAt,
      },
      { name: "Detalles", type: sql.NVarChar(sql.MAX), value: details },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new Error("El procedimiento de reserva no devolvió filas");
    }
    return readNumber(row, "IDReserva");
  }

  async updateReservationStatus(
    executor: CommandExecutor,
    reservationInternalId: number,
    status: StockReservationStatus,
  ): Promise<void> {
    await executor.execute(PROCEDURES.updateReservationStatus, [
      { name: "IDReserva", type: sql.Int, value: reservationInternalId },
      { name: "Estado", type: sql.NVarChar(20), value: status },
    ]);
  }

  async insertReservationHistory(
    executor: CommandExecutor,
    entry: ReservationHistorySnapshot,
  ): Promise<void> {
    await executor.execute(PROCEDURES.insertReservationHistory, [
      { name: "IDReserva", type: sql.Int, value: null },
      {
        name: "IDPublicoReserva",
        type: sql.UniqueIdentifier,
        value: entry.reservationPublicId,
      },
      { name: "Accion", type: sql.NVarChar(20), value: entry.action },
      { name: "IDUsuario", type: sql.Int, value: entry.userId },
      { name: "Motivo", type: sql.NVarChar(200), value: entry.reason },
    ]);
  }

  async saveOperation(
    executor: CommandExecutor,
    operation: IdempotencyOperationData,
  ): Promise<void> {
    await executor.execute(PROCEDURES.saveOperation, [
      {
        name: "TipoOperacion",
        type: sql.NVarChar(40),
        value: operation.operationType,
      },
      {
        name: "ClaveIdempotencia",
        type: sql.NVarChar(100),
        value: operation.idempotencyKey,
      },
      {
        name: "HuellaSolicitud",
        type: sql.NVarChar(512),
        value: operation.fingerprint,
      },
      {
        name: "IDPublicoResultado",
        type: sql.UniqueIdentifier,
        value: operation.resultPublicId,
      },
      {
        name: "IDPublicoVariante",
        type: sql.UniqueIdentifier,
        value: operation.variantPublicId,
      },
      { name: "IDUsuario", type: sql.Int, value: operation.userId },
    ]);
  }

  async findOperation(
    executor: CommandExecutor,
    operationType: string,
    idempotencyKey: string,
  ): Promise<IdempotencyOperationData | null> {
    const result = await executor.execute(PROCEDURES.findOperation, [
      { name: "TipoOperacion", type: sql.NVarChar(40), value: operationType },
      {
        name: "ClaveIdempotencia",
        type: sql.NVarChar(100),
        value: idempotencyKey,
      },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toOperationData(row);
  }

  async findBalanceByPublicId(
    variantPublicId: string,
    asOf: string,
  ): Promise<StockBalanceSnapshot | null> {
    const result = await this.executor.execute(
      PROCEDURES.findBalanceByPublicId,
      [
        {
          name: "IDPublicoVariante",
          type: sql.UniqueIdentifier,
          value: variantPublicId,
        },
        { name: "FechaAsOf", type: sql.DateTime2(3), value: asOf },
      ],
    );
    const row = firstRow(result.recordset);
    return row === null ? null : toBalanceState(row);
  }

  async fetchLockedBalances(
    executor: CommandExecutor,
    variantPublicIds: string[],
    asOf: string,
  ): Promise<StockBalanceSnapshot[]> {
    if (variantPublicIds.length === 0) return [];
    const result = await executor.execute(PROCEDURES.fetchLockedBalances, [
      {
        name: "IDPublicosVariante",
        type: sql.NVarChar(sql.MAX),
        value: joinIds(variantPublicIds),
      },
      { name: "FechaAsOf", type: sql.DateTime2(3), value: asOf },
    ]);
    return result.recordset.map(toBalanceState);
  }

  async sumActiveReserved(
    executor: CommandExecutor,
    variantPublicIds: string[],
    asOf: string,
  ): Promise<Map<string, number>> {
    const uniqueIds = Array.from(new Set(variantPublicIds));
    const reserved = new Map<string, number>(uniqueIds.map((id) => [id, 0]));
    if (uniqueIds.length === 0) return reserved;
    const result = await executor.execute(PROCEDURES.sumActiveReserved, [
      {
        name: "IDPublicosVariante",
        type: sql.NVarChar(sql.MAX),
        value: joinIds(uniqueIds),
      },
      { name: "FechaAsOf", type: sql.DateTime2(3), value: asOf },
    ]);
    // Variants without matching lines keep the pre-seeded zero.
    for (const row of result.recordset) {
      reserved.set(
        readUuid(row, "IDPublicoVariante"),
        readNumber(row, "CantidadReservada"),
      );
    }
    return reserved;
  }

  async hasStockOrActiveReservations(
    executor: CommandExecutor,
    variantInternalIds: number[],
    asOf: string,
  ): Promise<boolean> {
    if (variantInternalIds.length === 0) return false;
    const result = await executor.execute(
      PROCEDURES.hasStockOrActiveReservations,
      [
        {
          name: "IDVariantesInternos",
          type: sql.NVarChar(sql.MAX),
          value: joinIds(variantInternalIds),
        },
        { name: "FechaAsOf", type: sql.DateTime2(3), value: asOf },
      ],
    );
    // The procedure first returns the IDs it locked with UPDLOCK/HOLDLOCK;
    // its second recordset contains the boolean result of the guard.
    const row = firstRow(result.recordsets[1]);
    return row !== null && readBoolean(row, "TieneSaldoOReservas");
  }

  async listInventory(
    filters: InventoryListFilter,
  ): Promise<PaginatedReadModel<InventoryListItemReadModel>> {
    const result = await this.executor.execute(PROCEDURES.listInventory, [
      {
        name: "SoloDisponible",
        type: sql.Bit,
        value: filters.onlyAvailable ?? false,
      },
      // Undefined means "no active-state filter" for the procedure (NULL).
      { name: "SoloActivas", type: sql.Bit, value: filters.isActive ?? null },
      {
        name: "Busqueda",
        type: sql.NVarChar(100),
        value: filters.searchText ?? null,
      },
      { name: "Pagina", type: sql.Int, value: filters.page },
      { name: "TamanoPagina", type: sql.Int, value: filters.pageSize },
    ]);
    const { totalItems, pageRows } = toTwoRecordsetPagination(
      result.recordsets[0],
      result.recordsets[1],
    );
    return toPaginated(
      pageRows.map(toListItem),
      filters.page,
      filters.pageSize,
      totalItems,
    );
  }

  async listMovements(
    filters: MovementListFilter,
  ): Promise<PaginatedReadModel<InventoryMovementReadModel>> {
    const result = await this.executor.execute(PROCEDURES.listMovements, [
      {
        name: "IDPublicoVariante",
        type: sql.UniqueIdentifier,
        value: filters.variantPublicId,
      },
      {
        name: "TipoMovimiento",
        type: sql.NVarChar(30),
        value: filters.movementType ?? null,
      },
      {
        name: "FechaDesde",
        type: sql.DateTime2(3),
        value: filters.from ?? null,
      },
      { name: "FechaHasta", type: sql.DateTime2(3), value: filters.to ?? null },
      { name: "Pagina", type: sql.Int, value: filters.page },
      { name: "TamanoPagina", type: sql.Int, value: filters.pageSize },
    ]);
    const { totalItems, pageRows } = toTwoRecordsetPagination(
      result.recordsets[0],
      result.recordsets[1],
    );
    return toPaginated(
      pageRows.map(toMovementRead),
      filters.page,
      filters.pageSize,
      totalItems,
    );
  }

  async findReservationByPublicId(
    publicId: string,
  ): Promise<StockReservationSnapshot | null> {
    const result = await this.executor.execute(
      PROCEDURES.findReservationByPublicId,
      [{ name: "IDPublico", type: sql.UniqueIdentifier, value: publicId }],
    );
    return toReservationFromRecordsets(
      result.recordsets[0],
      result.recordsets[1],
    );
  }

  async fetchActiveReservation(
    executor: CommandExecutor,
    publicId: string,
    asOf: string,
  ): Promise<StockReservationSnapshot | null> {
    const result = await executor.execute(PROCEDURES.fetchActiveReservation, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
      { name: "FechaAsOf", type: sql.DateTime2(3), value: asOf },
    ]);
    return toReservationFromRecordsets(
      result.recordsets[0],
      result.recordsets[1],
    );
  }

  async fetchLockedReservation(
    executor: CommandExecutor,
    publicId: string,
  ): Promise<StockReservationSnapshot | null> {
    const result = await executor.execute(PROCEDURES.fetchLockedReservation, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    return toReservationFromRecordsets(
      result.recordsets[0],
      result.recordsets[1],
    );
  }

  async fetchLockedReservationById(
    executor: CommandExecutor,
    reservationInternalId: number,
  ): Promise<StockReservationSnapshot | null> {
    const result = await executor.execute(PROCEDURES.fetchLockedReservationById, [
      { name: "IDReserva", type: sql.Int, value: reservationInternalId },
    ]);
    return toReservationFromRecordsets(
      result.recordsets[0],
      result.recordsets[1],
    );
  }

  async findReservationBySourceReference(
    sourceReference: string,
    asOf: string,
  ): Promise<StockReservationSnapshot | null> {
    const result = await this.executor.execute(
      PROCEDURES.findReservationBySourceReference,
      [
        {
          name: "ReferenciaOrigen",
          type: sql.NVarChar(100),
          value: sourceReference,
        },
        { name: "FechaAsOf", type: sql.DateTime2(3), value: asOf },
      ],
    );
    return toReservationFromRecordsets(
      result.recordsets[0],
      result.recordsets[1],
    );
  }

  async findSaleMovementByOrderAndVariant(
    executor: CommandExecutor,
    orderInternalId: number,
    variantInternalId: number,
  ): Promise<StockMovementSnapshot | null> {
    const result = await executor.execute(
      PROCEDURES.findSaleMovementByOrderAndVariant,
      [
        { name: "IDPedido", type: sql.Int, value: orderInternalId },
        { name: "IDVariante", type: sql.Int, value: variantInternalId },
      ],
    );
    const row = firstRow(result.recordset);
    return row === null ? null : toMovementState(row);
  }

  async sumReintegrated(
    executor: CommandExecutor,
    saleMovementId: number,
  ): Promise<number> {
    const result = await executor.execute(PROCEDURES.sumReintegrated, [
      {
        name: "IDMovimientoVentaRelacionado",
        type: sql.BigInt,
        value: saleMovementId,
      },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? 0 : readNumber(row, "CantidadReintegrada");
  }

  async listExpiredReservations(
    executor: CommandExecutor,
    limit: number,
    asOf: string,
  ): Promise<StockReservationSnapshot[]> {
    const result = await executor.execute(PROCEDURES.listExpiredReservations, [
      { name: "Limite", type: sql.Int, value: limit },
      { name: "FechaAsOf", type: sql.DateTime2(3), value: asOf },
    ]);
    const headers = result.recordsets[0] ?? [];
    const lines = result.recordsets[1] ?? [];
    // Line rows carry IDReserva so they can be attached to their header.
    const linesByReservation = new Map<number, SqlRow[]>();
    for (const line of lines) {
      const reservationId = readNumber(line, "IDReserva");
      const list = linesByReservation.get(reservationId) ?? [];
      list.push(line);
      linesByReservation.set(reservationId, list);
    }
    return headers.map((header) =>
      toReservationState(
        header,
        linesByReservation.get(readNumber(header, "IDReserva")) ?? [],
      ),
    );
  }
}

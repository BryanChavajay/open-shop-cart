import sql from "mssql";
import type {
  Coupon,
  CouponSnapshot,
} from "../../../../domain/coupons/entities/coupon.entity.js";
import type { CouponRedemption } from "../../../../domain/coupons/entities/coupon-redemption.entity.js";
import { CouponDiscountType } from "../../../../domain/coupons/enums/coupon-discount-type.enum.js";
import { CouponScope } from "../../../../domain/coupons/enums/coupon-scope.enum.js";
import type {
  CouponReadRepository,
  CouponWriteRepository,
  LockedCouponRow,
} from "../../../../domain/coupons/interfaces/repositories/coupon.repository.js";
import type {
  CouponDetail,
  CouponListItem,
} from "../../../../domain/coupons/readmodels/coupon.read-model.js";
import { ConflictError } from "../../../../domain/shared/errors/conflict-error.js";
import { DuplicateKeyError } from "../../../../domain/shared/errors/duplicate-key.js";
import { NotFoundError } from "../../../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../../../domain/shared/enums/error-code.enum.js";
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
  insertCoupon: "SP_Cupones_Crear",
  updateCoupon: "SP_Cupones_Actualizar",
  updateCouponStatus: "SP_Cupones_EstadoActualizar",
  softDeleteCoupon: "SP_Cupones_Eliminar",
  findCouponByPublicId: "SP_Cupones_ObtenerPorIDPublico",
  findCouponByCode: "SP_Cupones_ObtenerPorCodigo",
  findLockedCouponByCode: "SP_Cupones_ObtenerParaRedimir",
  listCoupons: "SP_Cupones_ListarAdmin",
  countCustomerUses: "SP_Cupones_ConteoUsosCliente",
  recordCouponUse: "SP_Cupones_RegistrarUso",
} as const;

/** THROW numbers raised by the coupon procedures (range 50400..50410, migration 008). */
const THROW_CATEGORY_NOT_FOUND = 50400;
const THROW_CODE_IN_USE = 50401;
const THROW_CATEGORY_INACTIVE = 50402;
const THROW_COUPON_MISSING = 50405;
const THROW_INVALIDATE_REGISTERED_USAGES = 50406;
const THROW_TOTAL_LIMIT_EXHAUSTED = 50410;

/**
 * Translates the procedure-level THROW numbers of the coupons module into
 * domain errors. Unique-index violations are already handled centrally by the
 * executor's `mapSqlError`; these THROW codes never reach it.
 */
function mapCouponThrow(error: unknown): unknown {
  if (!(error instanceof sql.RequestError) || error.number === undefined) {
    return error;
  }
  switch (error.number) {
    case THROW_CODE_IN_USE:
      return new DuplicateKeyError();
    case THROW_COUPON_MISSING:
      return new NotFoundError(
        "Coupon not found",
        ErrorCode.COUPON_NOT_FOUND,
        undefined,
        undefined,
      );
    case THROW_TOTAL_LIMIT_EXHAUSTED:
      return new ConflictError(
        "The coupon total usage limit was exhausted",
        ErrorCode.COUPON_USAGE_LIMIT_EXHAUSTED,
        undefined,
        undefined,
      );
    case THROW_CATEGORY_NOT_FOUND:
    case THROW_CATEGORY_INACTIVE:
    case THROW_INVALIDATE_REGISTERED_USAGES:
      return new ConflictError(
        error.message,
        ErrorCode.INVALID_COUPON_STATE,
        undefined,
        undefined,
      );
    default:
      return error;
  }
}

/** Reads a DATETIME2(3) column exposed as a JS `Date` by the driver into ISO 8601 UTC string. */
function readIsoDate(row: SqlRow, column: string): string {
  const value = row[column];
  if (!(value instanceof Date)) {
    throw new TypeError(`Se esperaba fecha en la columna ${column}`);
  }
  return value.toISOString();
}

/**
 * Reads a DECIMAL(10, 2) column. The driver may return decimals as strings;
 * the conversion is exact for scale-2 amounts.
 */
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

function toCouponSnapshot(row: SqlRow): CouponSnapshot {
  return {
    id: readNumber(row, "IDCupon"),
    publicId: readUuid(row, "IDPublico"),
    code: readString(row, "Codigo"),
    discountType: parseEnum(
      CouponDiscountType,
      readString(row, "TipoDescuento"),
      "TipoDescuento",
    ),
    discountValue: readDecimal(row, "ValorDescuento"),
    scope: parseEnum(CouponScope, readString(row, "Alcance"), "Alcance"),
    categoryPublicId:
      row.IDPublicoCategoria === null
        ? null
        : readString(row, "IDPublicoCategoria").toLowerCase(),
    categoryId:
      row.IDCategoria === null ? null : readNumber(row, "IDCategoria"),
    minPurchaseAmount: readDecimal(row, "MontoMinimoCompra"),
    maxTotalUses: readNumber(row, "LimiteTotalUsos"),
    maxUsesPerCustomer: readNumber(row, "LimiteUsosPorCliente"),
    usedCount: readNumber(row, "UsosActuales"),
    startsAt: readIsoDate(row, "FechaInicioVigencia"),
    endsAt: readIsoDate(row, "FechaFinVigencia"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
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

/**
 * Coupon persistence on SQL Server through stored procedures.
 *
 * Write methods (and the transactional locked read) receive the use-case
 * `CommandExecutor` (UnitOfWork transaction); read methods run on the
 * executor provided to the constructor. Procedures never open transactions.
 */
export class MssqlCouponRepository
  implements CouponWriteRepository, CouponReadRepository
{
  constructor(private readonly executor: SqlExecutor) {}

  /** Read repository view bound to the executor handed over in use cases. */
  withExecutor(executor: CommandExecutor): CouponReadRepository {
    return new MssqlCouponRepository(executor);
  }

  async insertCoupon(
    executor: CommandExecutor,
    coupon: Coupon,
  ): Promise<number> {
    const snapshot = coupon.toSnapshot();
    try {
      const result = await executor.execute(PROCEDURES.insertCoupon, [
        {
          name: "IDPublico",
          type: sql.UniqueIdentifier,
          value: snapshot.publicId,
        },
        { name: "Codigo", type: sql.NVarChar(64), value: snapshot.code },
        {
          name: "TipoDescuento",
          type: sql.NVarChar(20),
          value: snapshot.discountType,
        },
        {
          name: "ValorDescuento",
          type: sql.Decimal(10, 2),
          value: snapshot.discountValue,
        },
        { name: "Alcance", type: sql.NVarChar(20), value: snapshot.scope },
        { name: "IDCategoria", type: sql.Int, value: snapshot.categoryId },
        {
          name: "MontoMinimoCompra",
          type: sql.Decimal(10, 2),
          value: snapshot.minPurchaseAmount,
        },
        {
          name: "LimiteTotalUsos",
          type: sql.Int,
          value: snapshot.maxTotalUses,
        },
        {
          name: "LimiteUsosPorCliente",
          type: sql.Int,
          value: snapshot.maxUsesPerCustomer,
        },
        {
          name: "FechaInicioVigencia",
          type: sql.DateTime2(3),
          value: snapshot.startsAt,
        },
        {
          name: "FechaFinVigencia",
          type: sql.DateTime2(3),
          value: snapshot.endsAt,
        },
        { name: "Activo", type: sql.Bit, value: snapshot.isActive },
      ]);
      const row = firstRow(result.recordset);
      if (row === null) {
        throw new Error("El procedimiento de cupón no devolvió filas");
      }
      return readNumber(row, "IDCupon");
    } catch (error: unknown) {
      throw mapCouponThrow(error);
    }
  }

  async updateCoupon(executor: CommandExecutor, coupon: Coupon): Promise<void> {
    const snapshot = coupon.toSnapshot();
    try {
      await executor.execute(PROCEDURES.updateCoupon, [
        { name: "IDCupon", type: sql.Int, value: snapshot.id },
        { name: "Codigo", type: sql.NVarChar(64), value: snapshot.code },
        {
          name: "TipoDescuento",
          type: sql.NVarChar(20),
          value: snapshot.discountType,
        },
        {
          name: "ValorDescuento",
          type: sql.Decimal(10, 2),
          value: snapshot.discountValue,
        },
        { name: "Alcance", type: sql.NVarChar(20), value: snapshot.scope },
        { name: "IDCategoria", type: sql.Int, value: snapshot.categoryId },
        {
          name: "MontoMinimoCompra",
          type: sql.Decimal(10, 2),
          value: snapshot.minPurchaseAmount,
        },
        {
          name: "LimiteTotalUsos",
          type: sql.Int,
          value: snapshot.maxTotalUses,
        },
        {
          name: "LimiteUsosPorCliente",
          type: sql.Int,
          value: snapshot.maxUsesPerCustomer,
        },
        {
          name: "FechaInicioVigencia",
          type: sql.DateTime2(3),
          value: snapshot.startsAt,
        },
        {
          name: "FechaFinVigencia",
          type: sql.DateTime2(3),
          value: snapshot.endsAt,
        },
      ]);
    } catch (error: unknown) {
      throw mapCouponThrow(error);
    }
  }

  async updateCouponStatus(
    executor: CommandExecutor,
    couponInternalId: number,
    isActive: boolean,
  ): Promise<void> {
    try {
      await executor.execute(PROCEDURES.updateCouponStatus, [
        { name: "IDCupon", type: sql.Int, value: couponInternalId },
        { name: "Activo", type: sql.Bit, value: isActive },
      ]);
    } catch (error: unknown) {
      throw mapCouponThrow(error);
    }
  }

  async softDeleteCoupon(
    executor: CommandExecutor,
    couponInternalId: number,
  ): Promise<void> {
    try {
      await executor.execute(PROCEDURES.softDeleteCoupon, [
        { name: "IDCupon", type: sql.Int, value: couponInternalId },
      ]);
    } catch (error: unknown) {
      throw mapCouponThrow(error);
    }
  }

  async recordCouponUse(
    executor: CommandExecutor,
    redemption: CouponRedemption,
  ): Promise<void> {
    try {
      await executor.execute(PROCEDURES.recordCouponUse, [
        { name: "IDCupon", type: sql.Int, value: redemption.couponId },
        {
          name: "IDPublicoUso",
          type: sql.UniqueIdentifier,
          value: redemption.publicId,
        },
        { name: "IDUsuario", type: sql.Int, value: redemption.userId },
        {
          name: "ReferenciaPedido",
          type: sql.NVarChar(100),
          value: redemption.saleReference,
        },
        {
          name: "MontoDescuento",
          type: sql.Decimal(10, 2),
          value: redemption.discountAmount,
        },
        { name: "FechaUso", type: sql.DateTime2(3), value: redemption.usedAt },
      ]);
    } catch (error: unknown) {
      throw mapCouponThrow(error);
    }
  }

  async findCouponByPublicId(publicId: string): Promise<CouponSnapshot | null> {
    const result = await this.executor.execute(
      PROCEDURES.findCouponByPublicId,
      [{ name: "IDPublico", type: sql.UniqueIdentifier, value: publicId }],
    );
    const row = firstRow(result.recordset);
    return row === null ? null : toCouponSnapshot(row);
  }

  /** Admin detail: same SP as the snapshot read, mapped with row metadata. */
  async findCouponDetailByPublicId(
    publicId: string,
  ): Promise<CouponDetail | null> {
    const result = await this.executor.execute(
      PROCEDURES.findCouponByPublicId,
      [{ name: "IDPublico", type: sql.UniqueIdentifier, value: publicId }],
    );
    const row = firstRow(result.recordset);
    return row === null ? null : this.toCouponDetail(row);
  }

  async findCouponByCode(code: string): Promise<CouponSnapshot | null> {
    const result = await this.executor.execute(PROCEDURES.findCouponByCode, [
      { name: "Codigo", type: sql.NVarChar(64), value: code },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toCouponSnapshot(row);
  }

  /** Locked redemption read: contract of SP_Cupones_ObtenerParaRedimir (UPDLOCK handled by SQL). */
  async findLockedCouponByCode(
    executor: CommandExecutor,
    code: string,
    customerId: number,
  ): Promise<LockedCouponRow | null> {
    const result = await executor.execute(PROCEDURES.findLockedCouponByCode, [
      { name: "Codigo", type: sql.NVarChar(64), value: code },
      { name: "IDUsuario", type: sql.Int, value: customerId },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      return null;
    }
    return {
      snapshot: toCouponSnapshot(row),
      customerUsageCount: readNumber(row, "UsosPorCliente"),
    };
  }

  async listCoupons(
    page: number,
    pageSize: number,
    onlyActive: boolean,
  ): Promise<PaginatedReadModel<CouponListItem>> {
    const result = await this.executor.execute(PROCEDURES.listCoupons, [
      { name: "Pagina", type: sql.Int, value: page },
      { name: "TamanoPagina", type: sql.Int, value: pageSize },
      { name: "SoloActivos", type: sql.Bit, value: onlyActive ? 1 : 0 },
    ]);
    // Recordset 0: total count; recordset 1: page rows (matches SP contract).
    const countRow = firstRow(result.recordsets[0]);
    const totalItems =
      countRow === null ? 0 : readNumber(countRow, "TotalFilas");
    const items = (result.recordsets[1] ?? []).map((row) =>
      this.toCouponListItem(row),
    );
    return toPaginated(items, page, pageSize, totalItems);
  }

  async countCustomerUses(
    couponInternalId: number,
    customerId: number,
  ): Promise<number> {
    const result = await this.executor.execute(PROCEDURES.countCustomerUses, [
      { name: "IDCupon", type: sql.Int, value: couponInternalId },
      { name: "IDUsuario", type: sql.Int, value: customerId },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new Error("El procedimiento de conteo de usos no devolvió filas");
    }
    return readNumber(row, "UsosPorCliente");
  }

  /**
   * Maps one admin-detail row (SP_Cupones_ObtenerPorIDPublico) to the read
   * model: the recordset carries the snapshot fields plus the category name
   * and both lifecycle timestamps.
   */
  private toCouponDetail(row: SqlRow): CouponDetail {
    const categoryPublicId = readNullableString(row, "IDPublicoCategoria");
    return {
      ...this.toCouponListItem(row),
      updatedAt: readIsoDate(row, "FechaActualizacion"),
      // The spread readonly fields already hold categoryPublicId; normalize it
      // the same way the snapshot mapper does.
      ...(categoryPublicId === null
        ? { categoryPublicId: null }
        : { categoryPublicId: categoryPublicId.toLowerCase() }),
    };
  }

  /**
   * Maps one listing row to the admin read model. The category name travels
   * in the listing recordset (SP_Cupones_ListarAdmin joins Categorias).
   */
  private toCouponListItem(row: SqlRow): CouponListItem {
    return {
      publicId: readUuid(row, "IDPublico"),
      code: readString(row, "Codigo"),
      discountType: parseEnum(
        CouponDiscountType,
        readString(row, "TipoDescuento"),
        "TipoDescuento",
      ),
      discountValue: readDecimal(row, "ValorDescuento"),
      scope: parseEnum(CouponScope, readString(row, "Alcance"), "Alcance"),
      categoryPublicId: readNullableString(row, "IDPublicoCategoria"),
      categoryName: readNullableString(row, "NombreCategoria"),
      minPurchaseAmount: readDecimal(row, "MontoMinimoCompra"),
      maxTotalUses: readNumber(row, "LimiteTotalUsos"),
      maxUsesPerCustomer: readNumber(row, "LimiteUsosPorCliente"),
      usedCount: readNumber(row, "UsosActuales"),
      startsAt: readIsoDate(row, "FechaInicioVigencia"),
      endsAt: readIsoDate(row, "FechaFinVigencia"),
      isActive: readBoolean(row, "Activo"),
      createdAt: readIsoDate(row, "FechaRegistro"),
    };
  }
}

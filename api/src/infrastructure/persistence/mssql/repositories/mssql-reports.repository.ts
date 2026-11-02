import sql from "mssql";
import type { SalesPeriodGranularity } from "../../../../domain/reports/enums/sales-period-granularity.enum.js";
import type {
  ReportsReadRepository,
} from "../../../../domain/reports/interfaces/repositories/reports.repository.js";
import type {
  SalesByCategoryItemReadModel,
} from "../../../../domain/reports/readmodels/sales-by-category.read-model.js";
import type {
  SalesByPeriodItemReadModel,
  SalesByPeriodReportReadModel,
  SalesByPeriodSummaryReadModel,
} from "../../../../domain/reports/readmodels/sales-by-period.read-model.js";
import type {
  TopSellingProductItemReadModel,
} from "../../../../domain/reports/readmodels/top-selling-product.read-model.js";
import {
  readDate,
  readNumber,
  readString,
  readUuid,
  requireFirstRow,
} from "../mssql-helpers.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";

const PROCEDURES = {
  salesByPeriod: "SP_Reportes_VentasPorPeriodo",
  salesByCategory: "SP_Reportes_VentasPorCategoria",
  topSellingProducts: "SP_Reportes_ProductosMasVendidos",
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

/**
 * Reads a DATE column (FechaInicioPeriodo) and normalizes it to the ISO
 * `YYYY-MM-DD` date string expected by the period read model.
 */
function readIsoDateOnly(row: SqlRow, column: string): string {
  return readDate(row, column).toISOString().slice(0, 10);
}

/** Maps one row of rowset 0 (period series) of SP_Reportes_VentasPorPeriodo. */
function toSalesByPeriodItem(row: SqlRow): SalesByPeriodItemReadModel {
  return {
    periodStart: readIsoDateOnly(row, "FechaInicioPeriodo"),
    ordersCount: readNumber(row, "NumeroPedidos"),
    unitsSold: readNumber(row, "UnidadesVendidas"),
    salesAmount: readDecimal(row, "MontoVentasQuetzales"),
    returnedAmount: readDecimal(row, "MontoDevueltoQuetzales"),
    shippingAmount: readDecimal(row, "MontoEnvioQuetzales"),
    averageTicket: readDecimal(row, "TicketPromedioQuetzales"),
  };
}

/** Maps the single row of rowset 1 (global summary) of SP_Reportes_VentasPorPeriodo. */
function toSalesByPeriodSummary(row: SqlRow): SalesByPeriodSummaryReadModel {
  return {
    totalOrders: readNumber(row, "TotalPedidos"),
    totalUnitsSold: readNumber(row, "TotalUnidades"),
    totalSalesAmount: readDecimal(row, "MontoTotalVentasQuetzales"),
    totalReturnedAmount: readDecimal(row, "MontoTotalDevueltoQuetzales"),
    totalShippingAmount: readDecimal(row, "MontoTotalEnvioQuetzales"),
    averageTicket: readDecimal(row, "TicketPromedioGlobalQuetzales"),
  };
}

/** Maps one row of SP_Reportes_VentasPorCategoria. */
function toSalesByCategoryItem(row: SqlRow): SalesByCategoryItemReadModel {
  return {
    categoryPublicId: readUuid(row, "IDPublicoCategoria"),
    categoryName: readString(row, "NombreCategoria"),
    ordersCount: readNumber(row, "NumeroPedidos"),
    unitsSold: readNumber(row, "UnidadesVendidas"),
    salesAmount: readDecimal(row, "MontoVentasQuetzales"),
    returnedAmount: readDecimal(row, "MontoDevueltoQuetzales"),
  };
}

/** Maps one row of SP_Reportes_ProductosMasVendidos. */
function toTopSellingProductItem(row: SqlRow): TopSellingProductItemReadModel {
  return {
    productPublicId: readUuid(row, "IDPublicoProducto"),
    productName: readString(row, "NombreProducto"),
    categoryPublicId: readUuid(row, "IDPublicoCategoria"),
    categoryName: readString(row, "NombreCategoria"),
    unitsSold: readNumber(row, "UnidadesVendidas"),
    salesAmount: readDecimal(row, "MontoVentasQuetzales"),
    ordersCount: readNumber(row, "NumeroPedidos"),
  };
}

/** Optional `[from, to)` window as procedure DATETIME2(3) parameters. */
function toWindowParams(from?: string, to?: string) {
  return [
    {
      name: "FechaDesde",
      type: sql.DateTime2(3),
      value: from === undefined ? null : new Date(from),
    },
    {
      name: "FechaHasta",
      type: sql.DateTime2(3),
      value: to === undefined ? null : new Date(to),
    },
  ];
}

/**
 * Reports persistence (RF-08) on SQL Server through the read-only
 * SP_Reportes_* procedures of migration 012. All metrics come pre-filtered
 * to DELIVERED + PAID orders and net of returns; amounts are quetzales with
 * scale 2 already applied by the procedures, so they are read as plain
 * numbers. Read methods run on the executor provided to the constructor.
 */
export class MssqlReportsRepository implements ReportsReadRepository {
  constructor(private readonly executor: SqlExecutor) {}

  /**
   * Time series of effective sales by period. The procedure returns two
   * rowsets: [0] the ascending series and [1] the global summary (always
   * exactly one row).
   */
  async getSalesByPeriod(filter: {
    granularity: SalesPeriodGranularity;
    from?: string;
    to?: string;
  }): Promise<SalesByPeriodReportReadModel> {
    const result = await this.executor.execute(
      PROCEDURES.salesByPeriod,
      [
        {
          name: "Agrupacion",
          type: sql.NVarChar(10),
          value: filter.granularity,
        },
        ...toWindowParams(filter.from, filter.to),
      ],
    );
    const items = (result.recordsets[0] ?? []).map(toSalesByPeriodItem);
    const summary = toSalesByPeriodSummary(requireFirstRow(result.recordsets[1]));
    return {
      granularity: filter.granularity,
      items,
      summary,
    };
  }

  /** Effective sales per category, ordered by `MontoVentasQuetzales` descending. */
  async getSalesByCategory(filter: {
    from?: string;
    to?: string;
  }): Promise<SalesByCategoryItemReadModel[]> {
    const result = await this.executor.execute(
      PROCEDURES.salesByCategory,
      toWindowParams(filter.from, filter.to),
    );
    return (result.recordset ?? []).map(toSalesByCategoryItem);
  }

  /** Top-N products by units sold net of returns (`@Limite`, 1..100). */
  async getTopSellingProducts(filter: {
    from?: string;
    to?: string;
    limit: number;
  }): Promise<TopSellingProductItemReadModel[]> {
    const result = await this.executor.execute(
      PROCEDURES.topSellingProducts,
      [
        ...toWindowParams(filter.from, filter.to),
        { name: "Limite", type: sql.Int, value: filter.limit },
      ],
    );
    return (result.recordset ?? []).map(toTopSellingProductItem);
  }
}

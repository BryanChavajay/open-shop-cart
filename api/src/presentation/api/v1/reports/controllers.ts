import type { RequestHandler } from "express";
import type { RouterDependencies } from "../router.js";
import { paginatedAbandonedCartsSchema } from "../../../../infrastructure/dtos/zod/cart/public.schemas.js";
import {
  salesByPeriodReportSchema,
  salesByCategoryReportSchema,
  topSellingProductsReportSchema,
} from "../../../../infrastructure/dtos/zod/reports/public.schemas.js";
import * as ordersPublicSchemas from "../../../../infrastructure/dtos/zod/orders/public.schemas.js";

type ReportsControllers = Record<
  "listAbandonedCarts" | "salesByPeriod" | "salesByCategory" | "topProducts" | "orders",
  RequestHandler
>;

export function createReportsControllers(deps: RouterDependencies): ReportsControllers {
  const { cart, reports, orders } = deps;

  return {
    listAbandonedCarts: async (_req, res) => {
      const report = await cart.reports.listAbandoned.execute(
        res.locals.validated.query,
      );
      res
        .set("Cache-Control", "no-store")
        .json(paginatedAbandonedCartsSchema.parse(report));
    },
    salesByPeriod: async (_req, res) => {
      const report = await reports.queries.salesByPeriod.execute(
        res.locals.validated.query,
      );
      res
        .set("Cache-Control", "no-store")
        .json(salesByPeriodReportSchema.parse(report));
    },
    salesByCategory: async (_req, res) => {
      const report = await reports.queries.salesByCategory.execute(
        res.locals.validated.query,
      );
      res
        .set("Cache-Control", "no-store")
        .json(salesByCategoryReportSchema.parse(report));
    },
    topProducts: async (_req, res) => {
      const report = await reports.queries.topProducts.execute(
        res.locals.validated.query,
      );
      res
        .set("Cache-Control", "no-store")
        .json(topSellingProductsReportSchema.parse(report));
    },
    // Admin order listing for report drill-down: mirrors the orders module.
    orders: async (_req, res) => {
      const report = await orders.admin.list.execute(
        res.locals.validated.query,
      );
      res
        .set("Cache-Control", "no-store")
        .json(ordersPublicSchemas.paginatedAdminOrdersSchema.parse(report));
    },
  };
}

import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/cart/request.schemas.js";
import * as reportsSchemas from "../../../../infrastructure/dtos/zod/reports/request.schemas.js";
import * as ordersSchemas from "../../../../infrastructure/dtos/zod/orders/request.schemas.js";
import type { RouterDependencies } from "../router.js";
import { createReportsControllers } from "./controllers.js";
import { guard } from "../middleware/guard.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

export function createReportsRouter(deps: RouterDependencies): Router {
  const router = Router();

  const controllers = createReportsControllers(deps);

  const admin = guard(deps.identity, Role.ADMINISTRADOR);

  router.get(
    "/abandoned-carts",
    admin,
    validate(schemas.listAbandonedCartsQuerySchema, "query"),
    controllers.listAbandonedCarts,
  );

  router.get(
    "/sales-by-period",
    admin,
    validate(reportsSchemas.salesByPeriodQuerySchema, "query"),
    controllers.salesByPeriod,
  );

  router.get(
    "/sales-by-category",
    admin,
    validate(reportsSchemas.salesByCategoryQuerySchema, "query"),
    controllers.salesByCategory,
  );

  router.get(
    "/top-products",
    admin,
    validate(reportsSchemas.topSellingProductsQuerySchema, "query"),
    controllers.topProducts,
  );

  /**
   * Staff order listing reused for dashboard drill-down: it delegates to the
   * orders module admin use case and its own DTOs.
   */
  router.get(
    "/orders",
    admin,
    validate(ordersSchemas.listAdminOrdersQuerySchema, "query"),
    controllers.orders,
  );

  return router;
}

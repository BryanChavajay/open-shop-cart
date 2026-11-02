import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/orders/request.schemas.js";
import type { OrderUseCases } from "../../../../application/orders/orders-use-cases.js";
import type { Identity } from "../middleware/guard.middleware.js";
import { createOrderControllers } from "./controllers.js";
import { guard } from "../middleware/guard.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

/**
 * Customers browse, inspect and cancel their own orders; the logistics
 * lifecycle (listing, transitions, staff cancellations and customer returns)
 * is operator/administrator-only and lives under the literal "/admin" prefix.
 */
export function createOrdersRouter(
  orders: OrderUseCases,
  identity: Identity,
): Router {
  const router = Router();
  const c = createOrderControllers(orders);
  const customerOnly = guard(identity, Role.CLIENTE);
  const staff = guard(identity, Role.OPERADOR, Role.ADMINISTRADOR);
  const orderPublicId = validate(schemas.orderPublicIdParamsSchema, "params");

  // Literal segments must be registered before the "/:orderPublicId" ones
  // so Express never treats "admin" as a public order id.
  router.get(
    "/admin",
    staff,
    validate(schemas.listAdminOrdersQuerySchema, "query"),
    c.listAdmin,
  );
  router.get("/admin/:orderPublicId", staff, orderPublicId, c.getAdmin);
  router.patch(
    "/admin/:orderPublicId/status",
    staff,
    orderPublicId,
    validate(schemas.transitionOrderStatusSchema),
    c.transition,
  );
  router.post(
    "/admin/:orderPublicId/cancel",
    staff,
    orderPublicId,
    validate(schemas.cancelOrderByStaffSchema),
    c.staffCancel,
  );
  router.post(
    "/admin/:orderPublicId/returns",
    staff,
    orderPublicId,
    validate(schemas.registerOrderReturnSchema),
    c.registerReturn,
  );

  router.get(
    "/",
    customerOnly,
    validate(schemas.listOwnOrdersQuerySchema, "query"),
    c.list,
  );
  router.get("/:orderPublicId", customerOnly, orderPublicId, c.get);
  router.post(
    "/:orderPublicId/cancel",
    customerOnly,
    orderPublicId,
    validate(schemas.cancelOrderSchema),
    c.cancel,
  );
  return router;
}

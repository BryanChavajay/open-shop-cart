import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/inventory/request.schemas.js";
import type { InventoryUseCases } from "../../../../application/inventory/inventory-use-cases.js";
import type { Identity } from "../middleware/guard.middleware.js";
import { createInventoryControllers } from "./controllers.js";
import { guard } from "../middleware/guard.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

export function createInventoryRouter(inventory: InventoryUseCases, identity: Identity): Router {
  const router = Router();
  const c = createInventoryControllers(inventory);
  // Inventory is staff-only: OPERADOR works it, ADMINISTRADOR supervises it.
  const staff = guard(identity, Role.OPERADOR, Role.ADMINISTRADOR);
  const variant = validate(schemas.variantParamsSchema, "params");
  router.get("/inventory", staff, validate(schemas.listInventoryQuerySchema, "query"), c.list);
  router.get("/inventory/variants/:variantPublicId", staff, variant, c.getVariantStock);
  router.get("/inventory/variants/:variantPublicId/kardex", staff, variant, validate(schemas.kardexQuerySchema, "query"), c.listKardex);
  router.post("/inventory/variants/:variantPublicId/purchase-receipts", staff, variant, validate(schemas.receivePurchaseStockSchema), c.receivePurchase);
  router.post("/inventory/variants/:variantPublicId/adjustments", staff, variant, validate(schemas.adjustStockSchema), c.adjust);
  return router;
}

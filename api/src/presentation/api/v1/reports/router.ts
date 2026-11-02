import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/cart/request.schemas.js";
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

  return router;
}

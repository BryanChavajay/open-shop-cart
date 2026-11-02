import { Router } from "express";
import * as schemas from "../../../../infrastructure/dtos/zod/cart/request.schemas.js";
import type { RouterDependencies } from "../router.js";
import { createCartControllers } from "./controllers.js";
import { validate } from "../middleware/validate.middleware.js";

export function createCartRouter(deps: RouterDependencies): Router {
  const router = Router();

  const controllers = createCartControllers(deps);

  router.post(
    "/activity",
    validate(schemas.cartActivityBodySchema),
    controllers.registerActivity,
  );

  router.delete("/", controllers.empty);

  return router;
}

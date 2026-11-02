import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/coupons/request.schemas.js";
import type { CouponUseCases } from "../../../../application/coupons/coupon-use-cases.js";
import type { Identity } from "../middleware/guard.middleware.js";
import { createCouponsControllers } from "./controllers.js";
import { guard } from "../middleware/guard.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

export function createCouponsRouter(coupons: CouponUseCases, identity: Identity): Router {
  const router = Router();
  const c = createCouponsControllers(coupons);
  // Administration is ADMINISTRADOR-only; evaluation is any authenticated user.
  const admin = guard(identity, Role.ADMINISTRADOR);
  const authenticated = guard(identity);
  const couponId = validate(schemas.couponPublicIdParamsSchema, "params");
  // The literal "evaluate" segment is static; it must be registered BEFORE the
  // parametric "/:couponPublicId" routes so Express never treats it as an id.
  router.post("/evaluate", authenticated, validate(schemas.evaluateCouponSchema), c.evaluate);
  router.post("/", admin, validate(schemas.createCouponSchema), c.create);
  router.get("/", admin, validate(schemas.listCouponsQuerySchema, "query"), c.list);
  router.get("/:couponPublicId", admin, couponId, c.get);
  router.put("/:couponPublicId", admin, couponId, validate(schemas.updateCouponSchema), c.update);
  router.patch("/:couponPublicId/activate", admin, couponId, c.activate);
  router.patch("/:couponPublicId/deactivate", admin, couponId, c.deactivate);
  router.delete("/:couponPublicId", admin, couponId, c.delete);
  return router;
}

import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as schemas from "../../../../infrastructure/dtos/zod/auth/request.schemas.js";
import { registerClientSchema } from "../../../../infrastructure/dtos/zod/users/request.schemas.js";
import type { RouterDependencies } from "../router.js";
import { createAuthControllers } from "./controllers.js";
import { validate } from "../middleware/validate.middleware.js";
import { guard } from "../middleware/guard.middleware.js";

export function createAuthRouter(deps: RouterDependencies): Router {
  const router = Router();

  const controllers = createAuthControllers(deps);


  const sensitive = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });


  router.post(
    "/register",
    sensitive,
    validate(registerClientSchema),
    controllers.register,
  );

  router.post(
    "/login",
    sensitive,
    validate(schemas.loginSchema),
    controllers.login,
  );

  router.post("/refresh", sensitive, controllers.refresh);

  router.post("/logout", controllers.logout);

  router.post(
    "/logout-all",
     guard(deps.identity),
    controllers.logoutAll,
  );

  router.post(
    "/password-recovery",
    sensitive,
    validate(schemas.requestPasswordRecoverySchema),
    controllers.requestRecovery,
  );

  router.post(
    "/reset-password",
    sensitive,
    validate(schemas.resetPasswordSchema),
    controllers.resetPassword,
  );

  router.post(
    "/confirm-account",
    sensitive,
    validate(schemas.confirmAccountSchema),
    controllers.confirmAccount,
  );

  return router;
}

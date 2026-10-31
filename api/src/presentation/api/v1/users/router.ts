import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/users/request.schemas.js";
import type { UserUseCases } from "../../../../application/users/user-use-cases.js";
import type { Identity } from "../middleware/guard.middleware.js";
import { createUsersControllers } from "./controllers.js";
import { guard } from "../middleware/guard.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

export function createUsersRouter(
  users: UserUseCases,
  identity: Identity,
): Router {
  const router = Router();

  const controllers = createUsersControllers(users);

  const admin = guard(identity, Role.ADMINISTRADOR);

  const id = validate(schemas.userIdParamsSchema, "params");

  router.get("/me", guard(identity), controllers.me);
  router.patch(
    "/me",
    guard(identity, Role.CLIENTE, Role.OPERADOR, Role.ADMINISTRADOR),
    validate(schemas.updateOwnProfileSchema),
    controllers.updateMe,
  );
  router.get(
    "/",
    admin,
    validate(schemas.listUsersQuerySchema, "query"),
    controllers.list,
  );
  router.post(
    "/",
    admin,
    validate(schemas.createInternalUserSchema),
    controllers.create,
  );
  router.get("/:publicId", admin, id, controllers.get);
  router.patch(
    "/:publicId",
    admin,
    id,
    validate(schemas.updateInternalUserSchema),
    controllers.update,
  );
  router.patch(
    "/:publicId/active",
    admin,
    id,
    validate(schemas.setUserActiveSchema),
    controllers.setActive,
  );
  router.delete("/:publicId", admin, id, controllers.delete);
  router.post(
    "/:publicId/password-recovery",
    admin,
    id,
    controllers.startRecovery,
  );
  router.post(
    "/:publicId/confirm-account",
    admin,
    id,
    controllers.resendConfirmation,
  );
  return router;
}

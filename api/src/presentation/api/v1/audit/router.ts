import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/audit/request.schemas.js";
import type { AuditUseCases } from "../../../../application/audit/audit-use-cases.js";
import type { Identity } from "../middleware/guard.middleware.js";
import { createAuditControllers } from "./controllers.js";
import { guard } from "../middleware/guard.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

export function createAuditRouter(
  audit: AuditUseCases,
  identity: Identity,
): Router {
  const router = Router();

  const controllers = createAuditControllers(audit);

  const admin = guard(identity, Role.ADMINISTRADOR);

  router.get(
    "/",
    admin,
    validate(schemas.listAuditQuerySchema, "query"),
    controllers.list,
  );
  router.get(
    "/:id",
    admin,
    validate(schemas.auditIdParamsSchema, "params"),
    controllers.get,
  );
  return router;
}

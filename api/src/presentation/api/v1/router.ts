import { Router } from "express";
import { hello } from "./controllers/hello.controller.js";
import { createAuthRouter } from "./auth/router.js";
import { createUsersRouter } from "./users/router.js";
import { createAuditRouter } from "./audit/router.js";
import { createCatalogRouter } from "./catalog/router.js";
import type { Authentication } from "../../../application/auth/authentication.js";
import type { UserUseCases } from "../../../application/users/user-use-cases.js";
import type { AuditUseCases } from "../../../application/audit/audit-use-cases.js";
import type { CatalogUseCases } from "../../../application/catalog/catalog-use-cases.js";
import type { Identity } from "./middleware/guard.middleware.js";

export interface RouterDependencies {
  auth: Authentication;
  users: UserUseCases;
  audit: AuditUseCases;
  catalog: CatalogUseCases;
  identity: Identity;
  secureCookies: boolean;
}
export function createV1Router(deps: RouterDependencies): Router {
  const router = Router();
  router.get("/hello", hello);
  router.use("/auth", createAuthRouter(deps));
  router.use("/users", createUsersRouter(deps.users, deps.identity));
  router.use("/audit", createAuditRouter(deps.audit, deps.identity));
  // Public catalog routes carry their /catalog prefix; admin routes stay at "/".
  router.use("/", createCatalogRouter(deps.catalog, deps.identity));
  return router;
}

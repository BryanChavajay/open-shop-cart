import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/addresses/request.schemas.js";
import type { AddressUseCases } from "../../../../application/addresses/address-use-cases.js";
import type { Identity } from "../middleware/guard.middleware.js";
import { createAddressControllers } from "./controllers.js";
import { guard } from "../middleware/guard.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

/**
 * The department/municipality catalog is readable by any authenticated user;
 * own-address management is CLIENTE-only (operators do not have addresses).
 */
export function createAddressesRouter(addresses: AddressUseCases, identity: Identity): Router {
  const router = Router();
  const c = createAddressControllers(addresses);
  const authenticated = guard(identity);
  const customerOnly = guard(identity, Role.CLIENTE);
  const departmentId = validate(schemas.departmentParamsSchema, "params");
  const addressId = validate(schemas.addressParamsSchema, "params");
  // Literal segments must be registered before the "/:addressPublicId" ones
  // so Express never treats "departments" as a public id.
  router.get("/departments", authenticated, c.listDepartments);
  router.get(
    "/departments/:departmentPublicId/municipalities",
    authenticated,
    departmentId,
    c.listMunicipalities,
  );
  router.post("/", customerOnly, validate(schemas.createAddressSchema), c.create);
  router.get("/", customerOnly, validate(schemas.listOwnAddressesQuerySchema, "query"), c.list);
  router.get("/:addressPublicId", customerOnly, addressId, c.get);
  router.put(
    "/:addressPublicId",
    customerOnly,
    addressId,
    validate(schemas.updateAddressSchema),
    c.update,
  );
  router.delete("/:addressPublicId", customerOnly, addressId, c.delete);
  return router;
}

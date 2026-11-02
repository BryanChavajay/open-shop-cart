import { Router } from "express";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import * as schemas from "../../../../infrastructure/dtos/zod/checkout/request.schemas.js";
import type { CheckoutUseCases } from "../../../../application/checkout/checkout-use-cases.js";
import type { Identity } from "../middleware/guard.middleware.js";
import { createCheckoutControllers } from "./controllers.js";
import { guard } from "../middleware/guard.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

/**
 * Customers start, release and confirm the checkout; the payment
 * verification of bank transfers is operator/administrator-only.
 */
export function createCheckoutRouter(checkout: CheckoutUseCases, identity: Identity): Router {
  const router = Router();
  const c = createCheckoutControllers(checkout);
  const customerOnly = guard(identity, Role.CLIENTE);
  const staff = guard(identity, Role.OPERADOR, Role.ADMINISTRADOR);
  const reservationId = validate(schemas.reservationParamsSchema, "params");
  const orderId = validate(schemas.verifyPaymentParamsSchema, "params");

  router.post("/reserve", customerOnly, validate(schemas.initiateCheckoutSchema), c.initiate);
  router.delete(
    "/reservations/:reservationPublicId",
    customerOnly,
    reservationId,
    c.release,
  );
  router.post("/confirm", customerOnly, validate(schemas.confirmCheckoutSchema), c.confirm);
  router.post(
    "/orders/:orderPublicId/verify-payment",
    staff,
    orderId,
    validate(schemas.verifyPaymentSchema),
    c.verify,
  );
  return router;
}

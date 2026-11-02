import type { Request, RequestHandler, Response } from "express";
import type { CheckoutUseCases } from "../../../../application/checkout/checkout-use-cases.js";
import * as schemas from "../../../../infrastructure/dtos/zod/checkout/request.schemas.js";
import * as publicSchemas from "../../../../infrastructure/dtos/zod/checkout/public.schemas.js";
import { currentUser } from "../middleware/current-user.js";
import { ValidateError } from "../../../../domain/shared/errors/validate-error.js";

type CheckoutControllers = Record<
  | "initiate"
  | "release"
  | "confirm"
  | "verify",
  RequestHandler
>;

/** The guarded customer id is the ownership anchor; it never comes from input. */
function customerId(res: Response): number {
  return currentUser(res).id;
}

/** Operators use the same guarded identity for verifications. */
function operatorId(res: Response): number {
  return currentUser(res).id;
}

/**
 * The `Idempotency-Key` header does not flow through the validate middleware
 * (which only handles body/params/query), so the controller applies its
 * schema to the header value directly via safeParse.
 */
function requireIdempotencyKey(req: Request): string {
  const parsed = schemas.idempotencyHeaderSchema.safeParse(req.headers["idempotency-key"]);
  if (!parsed.success) {
    throw new ValidateError(
      "Solicitud inválida",
      undefined,
      "Idempotency-Key header required",
      "headers",
    );
  }
  return parsed.data;
}

export function createCheckoutControllers(checkout: CheckoutUseCases): CheckoutControllers {
  return {
    initiate: async (_req, res) =>
      res.status(201).json(
        publicSchemas.checkoutInitiationSchema.parse(
          await checkout.initiate.execute({
            customerId: customerId(res),
            lines: res.locals.validated.body.items,
            ...(res.locals.validated.body.addressPublicId !== undefined
              ? { addressPublicId: res.locals.validated.body.addressPublicId }
              : {}),
            ...(res.locals.validated.body.couponCode !== undefined
              ? { couponCode: res.locals.validated.body.couponCode }
              : {}),
          }),
        ),
      ),
    release: async (_req, res) => {
      await checkout.release.execute({
        customerId: customerId(res),
        reservationPublicId: schemas.reservationParamsSchema.parse(
          res.locals.validated.params,
        ).reservationPublicId,
        joinExecutor: null,
      });
      res.status(204).end();
    },
    confirm: async (req, res) => {
      const body = res.locals.validated.body;
      const confirmation = await checkout.confirm.execute({
        customerId: customerId(res),
        idempotencyKey: requireIdempotencyKey(req),
        reservationPublicId: body.reservationPublicId,
        addressPublicId: body.addressPublicId,
        lines: body.items,
        ...(body.couponCode !== undefined ? { couponCode: body.couponCode } : {}),
        ...(body.cartToken !== undefined ? { cartToken: body.cartToken } : {}),
        payment: body.payment,
      });
      res.status(201).json(publicSchemas.checkoutConfirmationSchema.parse(confirmation));
    },
    verify: async (_req, res) => {
      const body = res.locals.validated.body;
      res.json(
        publicSchemas.paymentVerificationSchema.parse(
          await checkout.verification.execute({
            actor: { id: operatorId(res) },
            orderPublicId: schemas.verifyPaymentParamsSchema.parse(
              res.locals.validated.params,
            ).orderPublicId,
            decision: body.decided,
            ...(body.reason !== undefined ? { reason: body.reason } : {}),
          }),
        ),
      );
    },
  };
}

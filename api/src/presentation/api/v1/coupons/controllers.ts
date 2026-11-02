import type { RequestHandler, Response } from "express";
import type { CouponUseCases } from "../../../../application/coupons/coupon-use-cases.js";
import * as schemas from "../../../../infrastructure/dtos/zod/coupons/request.schemas.js";
import * as publicSchemas from "../../../../infrastructure/dtos/zod/coupons/public.schemas.js";
import { currentUser } from "../middleware/current-user.js";

type CouponsControllers = Record<
  | "create"
  | "list"
  | "get"
  | "update"
  | "activate"
  | "deactivate"
  | "delete"
  | "evaluate",
  RequestHandler
>;

/** The internal id of the guarded user feeds both the actor and the buyer. */
function currentUserId(res: Response): number {
  return currentUser(res).id;
}
function couponPublicId(res: Response): string {
  return schemas.couponPublicIdParamsSchema.parse(res.locals.validated.params)
    .couponPublicId;
}

export function createCouponsControllers(
  coupons: CouponUseCases,
): CouponsControllers {
  return {
    create: async (_req, res) =>
      res
        .status(201)
        .json(
          publicSchemas.createdCouponSchema.parse(
            await coupons.create.execute({
              ...res.locals.validated.body,
              actor: { id: currentUserId(res) },
            }),
          ),
        ),
    list: async (_req, res) =>
      res.json(
        publicSchemas.paginatedCouponsSchema.parse(
          await coupons.list.execute(res.locals.validated.query),
        ),
      ),
    get: async (_req, res) =>
      res.json(
        publicSchemas.couponDetailSchema.parse(
          await coupons.get.execute({ couponPublicId: couponPublicId(res) }),
        ),
      ),
    update: async (_req, res) => {
      const updated = await coupons.update.execute({
        ...res.locals.validated.body,
        couponPublicId: couponPublicId(res),
        actor: { id: currentUserId(res) },
      });
      res.status(200).json(publicSchemas.createdCouponSchema.parse(updated));
    },
    activate: async (_req, res) => {
      await coupons.activate.execute({
        couponPublicId: couponPublicId(res),
        actor: { id: currentUserId(res) },
      });
      res.status(204).end();
    },
    deactivate: async (_req, res) => {
      await coupons.deactivate.execute({
        couponPublicId: couponPublicId(res),
        actor: { id: currentUserId(res) },
      });
      res.status(204).end();
    },
    delete: async (_req, res) => {
      await coupons.delete.execute({
        couponPublicId: couponPublicId(res),
        actor: { id: currentUserId(res) },
      });
      res.status(204).end();
    },
    evaluate: async (_req, res) => {
      const { code, items, alreadyAppliedCouponCount } =
        res.locals.validated.body;
      const result = await coupons.evaluate.execute({
        customerId: currentUserId(res),
        code,
        items,
        alreadyAppliedCouponCount,
      });
      res
        .set("Cache-Control", "no-store")
        .json(publicSchemas.couponApplicationResultSchema.parse(result));
    },
  };
}

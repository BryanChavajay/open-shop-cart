import type { RequestHandler, Response } from "express";
import type { OrderUseCases } from "../../../../application/orders/orders-use-cases.js";
import * as publicSchemas from "../../../../infrastructure/dtos/zod/orders/public.schemas.js";
import { currentUser } from "../middleware/current-user.js";

type OrderControllers = Record<
  | "list"
  | "get"
  | "cancel"
  | "listAdmin"
  | "getAdmin"
  | "transition"
  | "staffCancel"
  | "registerReturn",
  RequestHandler
>;

/** The guarded actor id is the audit anchor; it never comes from input. */
function actor(res: Response): { id: number } {
  return { id: currentUser(res).id };
}

export function createOrderControllers(
  orders: OrderUseCases,
): OrderControllers {
  return {
    list: async (_req, res) => {
      const report = await orders.own.list.execute({
        ...res.locals.validated.query,
        actor: actor(res),
      });
      // Own-order listings are sensitive (private purchase history).
      res
        .set("Cache-Control", "no-store")
        .json(publicSchemas.paginatedOwnOrdersSchema.parse(report));
    },
    get: async (_req, res) => {
      const detail = await orders.own.get.execute({
        actor: actor(res),
        orderPublicId: res.locals.validated.params.orderPublicId,
      });
      res.json(publicSchemas.orderDetailResponseSchema.parse(detail));
    },
    cancel: async (_req, res) => {
      const cancellation = await orders.own.cancel.execute({
        actor: actor(res),
        orderPublicId: res.locals.validated.params.orderPublicId,
        ...(res.locals.validated.body.reason !== undefined
          ? { reason: res.locals.validated.body.reason }
          : {}),
      });
      res.json(publicSchemas.orderCancellationSchema.parse(cancellation));
    },
    listAdmin: async (_req, res) => {
      const report = await orders.admin.list.execute(
        res.locals.validated.query,
      );
      res
        .set("Cache-Control", "no-store")
        .json(publicSchemas.paginatedAdminOrdersSchema.parse(report));
    },
    getAdmin: async (_req, res) => {
      const detail = await orders.admin.get.execute({
        orderPublicId: res.locals.validated.params.orderPublicId,
      });
      res.json(publicSchemas.orderDetailResponseSchema.parse(detail));
    },
    transition: async (_req, res) => {
      const transition = await orders.admin.transition.execute({
        actor: actor(res),
        orderPublicId: res.locals.validated.params.orderPublicId,
        targetStatus: res.locals.validated.body.targetStatus,
        ...(res.locals.validated.body.reason !== undefined
          ? { reason: res.locals.validated.body.reason }
          : {}),
      });
      res.json(publicSchemas.orderTransitionSchema.parse(transition));
    },
    staffCancel: async (_req, res) => {
      const cancellation = await orders.admin.cancel.execute({
        actor: actor(res),
        orderPublicId: res.locals.validated.params.orderPublicId,
        reason: res.locals.validated.body.reason,
      });
      res.json(publicSchemas.orderCancellationSchema.parse(cancellation));
    },
    registerReturn: async (_req, res) => {
      const rest = await orders.admin.returns.execute({
        actor: actor(res),
        orderPublicId: res.locals.validated.params.orderPublicId,
        items: res.locals.validated.body.items,
        ...(res.locals.validated.body.reason !== undefined
          ? { reason: res.locals.validated.body.reason }
          : {}),
      });
      res.json(publicSchemas.orderReturnSchema.parse(rest));
    },
  };
}

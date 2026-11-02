import type { RequestHandler } from "express";
import type { RouterDependencies } from "../router.js";
import { paginatedAbandonedCartsSchema } from "../../../../infrastructure/dtos/zod/cart/public.schemas.js";

type ReportsControllers = Record<"listAbandonedCarts", RequestHandler>;

export function createReportsControllers(deps: RouterDependencies): ReportsControllers {
  const { cart } = deps;

  return {
    listAbandonedCarts: async (_req, res) => {
      const report = await cart.reports.listAbandoned.execute(
        res.locals.validated.query,
      );
      res
        .set("Cache-Control", "no-store")
        .json(paginatedAbandonedCartsSchema.parse(report));
    },
  };
}

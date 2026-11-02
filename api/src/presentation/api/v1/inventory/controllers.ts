import type { Request, RequestHandler, Response } from "express";
import type { InventoryUseCases } from "../../../../application/inventory/inventory-use-cases.js";
import * as schemas from "../../../../infrastructure/dtos/zod/inventory/request.schemas.js";
import * as publicSchemas from "../../../../infrastructure/dtos/zod/inventory/public.schemas.js";
import { currentUser } from "../middleware/current-user.js";
import { ValidateError } from "../../../../domain/shared/errors/validate-error.js";

type InventoryControllers = Record<
  "list" | "getVariantStock" | "listKardex" | "receivePurchase" | "adjust", RequestHandler>;

function actor(res: Response) { return { id: currentUser(res).id }; }
function variantPublicId(res: Response) {
  return schemas.variantParamsSchema.parse(res.locals.validated.params).variantPublicId;
}
function idempotencyKey(req: Request): string {
  const parsed = schemas.idempotencyHeaderSchema.safeParse(req.headers["idempotency-key"]);
  if (!parsed.success) {
    throw new ValidateError("Solicitud inválida", undefined, "Idempotency-Key header required", "headers");
  }
  return parsed.data;
}

export function createInventoryControllers(inventory: InventoryUseCases): InventoryControllers {
  return {
    list: async (_req, res) => res.json(publicSchemas.paginatedInventorySchema.parse(await inventory.queries.list.execute(res.locals.validated.query))),
    getVariantStock: async (_req, res) => res.json(publicSchemas.variantStockSchema.parse(await inventory.queries.get.execute({ variantPublicId: variantPublicId(res) }))),
    listKardex: async (_req, res) => res.json(publicSchemas.paginatedMovementsSchema.parse(await inventory.queries.kardex.execute({ ...res.locals.validated.query, variantPublicId: variantPublicId(res) }))),
    receivePurchase: async (req, res) => {
      const created = await inventory.purchases.receive.execute({
        actor: actor(res), variantPublicId: variantPublicId(res),
        ...res.locals.validated.body, idempotencyKey: idempotencyKey(req), joinExecutor: null,
      });
      res.status(201).json(publicSchemas.createdInventoryOperationSchema.parse(created));
    },
    adjust: async (req, res) => {
      const created = await inventory.adjustments.apply.execute({
        actor: actor(res), variantPublicId: variantPublicId(res),
        ...res.locals.validated.body, idempotencyKey: idempotencyKey(req), joinExecutor: null,
      });
      res.status(201).json(publicSchemas.createdInventoryOperationSchema.parse(created));
    },
  };
}

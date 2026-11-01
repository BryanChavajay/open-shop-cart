import type { RequestHandler } from "express";
import type { AuditUseCases } from "../../../../application/audit/audit-use-cases.js";
import type { AuditListItemReadModel } from "../../../../domain/audit/readmodels/audit-list-item.read-model.js";
import * as schemas from "../../../../infrastructure/dtos/zod/audit/request.schemas.js";
import * as publicSchemas from "../../../../infrastructure/dtos/zod/audit/public.schemas.js";

/** Dates leave the API as ISO 8601 strings. */
function toPublic(
  entry: AuditListItemReadModel,
): Omit<AuditListItemReadModel, "registeredAt"> & { registeredAt: string } {
  return { ...entry, registeredAt: entry.registeredAt.toISOString() };
}

export function createAuditControllers(
  audit: AuditUseCases,
): Record<"list" | "get", RequestHandler> {
  return {
    list: async (_req, res) => {
      const query = schemas.listAuditQuerySchema.parse(res.locals.validated.query);
      const page = await audit.list.execute(query);
      res.json(
        publicSchemas.paginatedAuditPublicSchema.parse({
          ...page,
          items: page.items.map(toPublic),
        }),
      );
    },
    get: async (_req, res) => {
      res.json(
        publicSchemas.auditDetailSchema.parse(
          toPublic(
            await audit.get.execute({
              ...schemas.auditIdParamsSchema.parse(res.locals.validated.params),
            }),
          ),
        ),
      );
    },
  };
}

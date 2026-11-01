import { z } from "zod";
import { paginatedSchema } from "../shared/paginated.schema.js";

export const auditModuleCodeSchema = z.number().int();

export const auditActionSchema = z.string().max(20);

export const auditEntityTypeSchema = z.string().min(1).max(50);

export const auditListItemSchema = z.object({
  id: z.string().regex(/^\d+$/),
  moduleCode: auditModuleCodeSchema,
  entityType: auditEntityTypeSchema,
  entityIdentifier: auditEntityTypeSchema,
  action: auditActionSchema,
  userPublicId: z.uuid(),
  userFirstName: z.string(),
  userLastName: z.string().nullable(),
  registeredAt: z.iso.datetime(),
});

export type AuditListItem = z.infer<typeof auditListItemSchema>;

export const auditDetailSchema = auditListItemSchema.extend({
  previousValues: z.record(z.string(), z.unknown()).nullable(),
  newValues: z.record(z.string(), z.unknown()).nullable(),
});

export const paginatedAuditPublicSchema = paginatedSchema(auditListItemSchema);

import { z } from "zod";
import { AuditModule } from "../../../../domain/audit/enums/audit-module.enum.js";

const positiveInteger = z.coerce.number().positive();

const MODULE_CODES: readonly number[] = [
  AuditModule.CATALOG,
  AuditModule.INVENTORY,
  AuditModule.COUPONS,
  AuditModule.ORDERS,
];

export const listAuditQuerySchema = z.strictObject({
  moduleCode: z.coerce
    .number()
    .int()
    .refine((value) => MODULE_CODES.includes(value), "Módulo inválido")
    .optional(),
  page: positiveInteger.optional().default(1),
  pageSize: positiveInteger.pipe(z.number().max(100)).optional().default(20),
});

export const auditIdParamsSchema = z.strictObject({ id: z.string().regex(/^\d+$/) });

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

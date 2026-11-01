import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { AuditListItemReadModel } from "../../domain/audit/readmodels/audit-list-item.read-model.js";
import type { PaginatedReadModel } from "../../domain/shared/readmodels/paginated.read-model.js";
import { AuditModule } from "../../domain/audit/enums/audit-module.enum.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

const MODULE_CODES: readonly number[] = [
  AuditModule.CATALOG,
  AuditModule.INVENTORY,
  AuditModule.COUPONS,
  AuditModule.ORDERS,
];

export interface ListAuditEntriesQuery {
  moduleCode?: number | undefined;
  page: number;
  pageSize: number;
}

export class ListAuditEntries {
  constructor(private readonly audit: Pick<AuditRepository, "list">) {}

  async execute(
    query: ListAuditEntriesQuery,
  ): Promise<PaginatedReadModel<AuditListItemReadModel>> {
    if (
      !Number.isSafeInteger(query.page) ||
      query.page < 1 ||
      !Number.isSafeInteger(query.pageSize) ||
      query.pageSize < 1 ||
      query.pageSize > 100
    )
      throw new BusinessRuleViolation(
        "Paginación inválida",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );

    if (
      query.moduleCode !== undefined &&
      !MODULE_CODES.includes(query.moduleCode)
    )
      throw new BusinessRuleViolation(
        "Módulo de bitácora inválido",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );

    return this.audit.list({
      moduleCode: query.moduleCode ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}

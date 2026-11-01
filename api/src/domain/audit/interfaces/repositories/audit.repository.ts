import type { AuditEntry } from "../../entities/audit-entry.entity.js";
import type { AuditDetailReadModel } from "../../readmodels/audit-detail.read-model.js";
import type { AuditListItemReadModel } from "../../readmodels/audit-list-item.read-model.js";
import type { PaginatedReadModel } from "../../../shared/readmodels/paginated.read-model.js";

export interface ListAuditEntriesFilter {
  /** Filtrado por módulo de negocio. Null para incluir todos los módulos. */
  moduleCode: number | null;
  page: number;
  pageSize: number;
}

/**
 * Acceso a la entidad AuditEntry. Las implementaciones usan stored procedures.
 */
export interface AuditRepository {
  /** Registra una entrada nueva. La bitácora es append-only. */
  append(entry: AuditEntry): Promise<void>;
  list(filter: ListAuditEntriesFilter): Promise<PaginatedReadModel<AuditListItemReadModel>>;
  findById(id: string): Promise<AuditDetailReadModel | null>;
}

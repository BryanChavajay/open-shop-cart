import type { AuditListItemReadModel } from "./audit-list-item.read-model.js";

/** Detalle de un registro de bitácora con los valores anterior y nuevo del cambio. */
export interface AuditDetailReadModel extends AuditListItemReadModel {
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

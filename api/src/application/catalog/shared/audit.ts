import { AuditEntry } from "../../../domain/audit/entities/audit-entry.entity.js";
import { AuditAction } from "../../../domain/audit/enums/audit-action.enum.js";
import { AuditModule } from "../../../domain/audit/enums/audit-module.enum.js";
import type { CatalogActor } from "./dependencies.js";

/** Entity types tracked by the catalog module in the audit trail. */
export type CatalogEntityType =
  | "Category"
  | "Brand"
  | "Product"
  | "Variant"
  | "Image";

export interface CatalogAuditData {
  entityType: CatalogEntityType;
  /** Public identifier of the affected entity. */
  entityIdentifier: string;
  action: AuditAction;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

/**
 * Builds the AuditEntry of a catalog operation (module CATALOG). Values are
 * objects; the persistence layer serializes them to JSON. For DEACTIVATE and
 * DELETE actions only the previous values are recorded (new values null).
 */
export function auditEntryForCatalog(
  data: CatalogAuditData,
  actor: CatalogActor,
): AuditEntry {
  return AuditEntry.create({
    userId: actor.id,
    moduleCode: AuditModule.CATALOG,
    entityType: data.entityType,
    entityIdentifier: data.entityIdentifier,
    action: data.action,
    previousValues: data.previousValues ?? null,
    newValues: data.newValues ?? null,
  });
}

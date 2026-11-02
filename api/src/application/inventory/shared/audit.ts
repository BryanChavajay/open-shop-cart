import { AuditEntry } from "../../../domain/audit/entities/audit-entry.entity.js";
import { AuditAction } from "../../../domain/audit/enums/audit-action.enum.js";
import { AuditModule } from "../../../domain/audit/enums/audit-module.enum.js";
import type { InventoryActor } from "./dependencies.js";

/** Entity types tracked by the inventory module in the audit trail. */
export type InventoryEntityType = "Variant" | "StockBalance";

export interface InventoryAuditData {
  entityType: InventoryEntityType;
  /** Public identifier of the affected entity. */
  entityIdentifier: string;
  action: AuditAction;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

/**
 * Builds the AuditEntry of an inventory operation (module INVENTORY). Values
 * are objects; the persistence layer serializes them to JSON. Stock changes
 * record the physical quantities before and after the movement along with the
 * documented reason and source reference.
 */
export function auditEntryForInventory(
  data: InventoryAuditData,
  actor: InventoryActor,
): AuditEntry {
  return AuditEntry.create({
    userId: actor.id,
    moduleCode: AuditModule.INVENTORY,
    entityType: data.entityType,
    entityIdentifier: data.entityIdentifier,
    action: data.action,
    previousValues: data.previousValues ?? null,
    newValues: data.newValues ?? null,
  });
}

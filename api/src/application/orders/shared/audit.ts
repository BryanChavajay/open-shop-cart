import { AuditEntry } from "../../../domain/audit/entities/audit-entry.entity.js";
import { AuditAction } from "../../../domain/audit/enums/audit-action.enum.js";
import { AuditModule } from "../../../domain/audit/enums/audit-module.enum.js";
import type { OrderActor } from "./dependencies.js";

/** Entity types tracked by the orders module in the audit trail. */
export type OrdersEntityType = "Order" | "OrderStatus" | "OrderReturn";

export interface OrdersAuditData {
  entityType: OrdersEntityType;
  /** Public identifier of the affected entity. */
  entityIdentifier: string;
  action: AuditAction;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

/**
 * Builds the AuditEntry of an order-management operation (module ORDERS).
 * Status transitions record both states; cancellations and line returns add
 * the reintegrated/returned units and the documented reason.
 */
export function auditEntryForOrders(
  data: OrdersAuditData,
  actor: OrderActor,
): AuditEntry {
  return AuditEntry.create({
    userId: actor.id,
    moduleCode: AuditModule.ORDERS,
    entityType: data.entityType,
    entityIdentifier: data.entityIdentifier,
    action: data.action,
    previousValues: data.previousValues ?? null,
    newValues: data.newValues ?? null,
  });
}

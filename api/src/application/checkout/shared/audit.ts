import { AuditEntry } from "../../../domain/audit/entities/audit-entry.entity.js";
import { AuditAction } from "../../../domain/audit/enums/audit-action.enum.js";
import { AuditModule } from "../../../domain/audit/enums/audit-module.enum.js";
import type { CheckoutActor } from "./dependencies.js";

/** Entity types tracked by the checkout module in the audit trail. */
export type CheckoutEntityType = "Order" | "OrderPayment";

export interface CheckoutAuditData {
  entityType: CheckoutEntityType;
  /** Public identifier of the affected entity. */
  entityIdentifier: string;
  action: AuditAction;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

/**
 * Builds the AuditEntry of a checkout operation (module ORDERS). Order
 * creations and payment verifications are tracked with both values.
 */
export function auditEntryForCheckout(
  data: CheckoutAuditData,
  actor: CheckoutActor,
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

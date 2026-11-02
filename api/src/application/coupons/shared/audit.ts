import { AuditEntry } from "../../../domain/audit/entities/audit-entry.entity.js";
import { AuditAction } from "../../../domain/audit/enums/audit-action.enum.js";
import { AuditModule } from "../../../domain/audit/enums/audit-module.enum.js";
import type { CouponActor } from "./dependencies.js";

/** Entity types tracked by the coupons module in the audit trail. */
export type CouponEntityType = "Coupon";

export interface CouponAuditData {
  entityType: CouponEntityType;
  /** Public identifier of the affected entity. */
  entityIdentifier: string;
  action: AuditAction;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

/**
 * Builds the AuditEntry of a coupons operation (module COUPONS). Values are
 * objects; the persistence layer serializes them to JSON. For DEACTIVATE and
 * DELETE actions only the previous values are recorded (new values null).
 * Coupon redemptions are logged as CREATE actions on the "Coupon" entity with
 * the sale reference and applied discount in `newValues`.
 */
export function auditEntryForCoupons(
  data: CouponAuditData,
  actor: CouponActor,
): AuditEntry {
  return AuditEntry.create({
    userId: actor.id,
    moduleCode: AuditModule.COUPONS,
    entityType: data.entityType,
    entityIdentifier: data.entityIdentifier,
    action: data.action,
    previousValues: data.previousValues ?? null,
    newValues: data.newValues ?? null,
  });
}

import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import { StockMovementType } from "../enums/stock-movement-type.enum.js";

/** Maximum accepted length for a movement or history reason. */
export const REASON_MAX_LENGTH = 200;
/** Maximum accepted length for a source document reference. */
export const REFERENCE_MAX_LENGTH = 100;
/** Maximum timespan between a reservation's creation and its expiry. */
export const RESERVATION_MAX_DURATION_MS = 15 * 60 * 1000;

/** Validated textual contents of a stock movement. */
export interface MovementShape {
  reason: string;
  sourceReference: string | null;
  relatedSalePublicId: string | null;
}

/** Accepts whole numbers greater than zero, validating on the field's name. */
export function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new BusinessRuleViolation(
      `The field ${field} must be an integer greater than zero`,
      ErrorCode.INVALID_INPUT,
      field,
      undefined,
    );
  }
  return value;
}

/** Accepts whole numbers greater than or equal to zero. */
export function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new BusinessRuleViolation(
      `The field ${field} must be an integer greater than or equal to zero`,
      ErrorCode.INVALID_INPUT,
      field,
      undefined,
    );
  }
  return value;
}

/** Accepts a public identifier as non-empty text. */
export function requirePublicId(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleViolation(
      `The required field ${field} was not provided`,
      ErrorCode.REQUIRED_FIELD_MISSING,
      field,
      undefined,
    );
  }
  return trimmed;
}

/** Accepts mandatory text, trimmed and bounded in length. */
export function requireTrimmedText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleViolation(
      `The required field ${field} was not provided`,
      ErrorCode.REQUIRED_FIELD_MISSING,
      field,
      undefined,
    );
  }
  if (trimmed.length > maxLength) {
    throw new BusinessRuleViolation(
      `The field ${field} exceeds ${maxLength} characters`,
      ErrorCode.INVALID_INPUT,
      field,
      undefined,
    );
  }
  return trimmed;
}

/** Accepts nullable text; when present it must be non-empty and bounded in length. */
export function requireOptionalTrimmedText(
  value: string | null,
  field: string,
  maxLength: number,
): string | null {
  if (value === null) {
    return null;
  }
  return requireTrimmedText(value, field, maxLength);
}

/** Accepts an ISO instant that `Date` can parse into a finite timestamp. */
export function requireInstant(value: string, field: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new BusinessRuleViolation(
      `The field ${field} must be a valid instant`,
      ErrorCode.INVALID_INPUT,
      field,
      undefined,
    );
  }
  return instant;
}

/**
 * Enforces the per-type shape of a kardex movement: sign of the delta, the
 * mandatory reason and the UUID compatibility field. Shared by
 * `StockMovement.create` and `StockBalance.applyMovement` so both entry points
 * agree on the rules.
 */
export function assertMovementShape(
  movementType: StockMovementType,
  quantityDelta: number,
  reason: string,
  sourceReference: string | null,
  relatedSalePublicId: string | null,
): MovementShape {
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    throw new BusinessRuleViolation(
      "The quantity delta must be a non-zero integer",
      ErrorCode.INVALID_INPUT,
      "quantityDelta",
      undefined,
    );
  }
  if (movementType === StockMovementType.MANUAL_ADJUSTMENT) {
    assertNoRelatedSale(relatedSalePublicId);
  } else if (movementType === StockMovementType.PURCHASE_RECEIPT) {
    assertNoRelatedSale(relatedSalePublicId);
    assertDeltaSign(quantityDelta, "greater than zero");
  } else if (movementType === StockMovementType.SALE) {
    assertNoRelatedSale(relatedSalePublicId);
    assertDeltaSign(quantityDelta, "lower than zero", quantityDelta < 0);
  } else if (
    movementType === StockMovementType.CUSTOMER_RETURN
    || movementType === StockMovementType.SALE_CANCELLATION
  ) {
    assertNoRelatedSale(relatedSalePublicId);
    assertDeltaSign(quantityDelta, "greater than zero");
  }
  return {
    reason: requireTrimmedText(reason, "reason", REASON_MAX_LENGTH),
    sourceReference: requireOptionalTrimmedText(sourceReference, "sourceReference", REFERENCE_MAX_LENGTH),
    relatedSalePublicId: requireOptionalTrimmedText(
      relatedSalePublicId,
      "relatedSalePublicId",
      REFERENCE_MAX_LENGTH,
    ),
  };
}

function assertDeltaSign(quantityDelta: number, expected: string, valid: boolean = quantityDelta > 0): void {
  if (!valid) {
    throw new BusinessRuleViolation(
      `A movement of this type requires a quantity delta ${expected}`,
      ErrorCode.INVALID_INPUT,
      "quantityDelta",
      undefined,
    );
  }
}

function assertNoRelatedSale(relatedSalePublicId: string | null): void {
  if (relatedSalePublicId !== null) {
    throw new BusinessRuleViolation(
      "A movement of this type must not carry a related sale",
      ErrorCode.INVALID_INPUT,
      "relatedSalePublicId",
      undefined,
    );
  }
}

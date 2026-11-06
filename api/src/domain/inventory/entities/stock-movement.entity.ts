import type { StockMovementSnapshot } from "./inventory-movement.entity.js";
import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import {
  assertMovementShape,
  requireInstant,
  requireNonNegativeInteger,
  requirePositiveInteger,
  requirePublicId,
} from "./inventory-rules.js";
import { StockMovementType } from "../enums/stock-movement-type.enum.js";

/**
 * Data required to append a new kardex movement. `publicId` and `createdAt`
 * are supplied by the use case from its clock and identifier generator.
 */
export interface NewStockMovementData {
  publicId: string;
  variantId: number;
  variantPublicId: string;
  movementType: StockMovementType;
  quantityDelta: number;
  balanceBefore: number;
  balanceAfter: number;
  userId: number;
  reason: string;
  sourceReference: string | null;
  orderId?: number | null;
  relatedSaleMovementId?: number | null;
  relatedSalePublicId: string | null;
  /** Creation instant, ISO string (UTC), provided by the use case clock. */
  createdAt: string;
}

/**
 * Kardex movement entity. The kardex is append-only: entries are immutable
 * after creation and errors are corrected with compensatory movements. Every
 * field is validated on `create`; restores from persistence skip validation.
 */
export class StockMovement {
  private state: StockMovementSnapshot;

  private constructor(state: StockMovementSnapshot) {
    this.state = state;
  }

  /** Creates and validates a new kardex movement. */
  static create(data: NewStockMovementData): StockMovement {
    const shape = assertMovementShape(
      data.movementType,
      data.quantityDelta,
      data.reason,
      data.sourceReference,
      data.relatedSalePublicId,
    );
    const orderId = data.orderId === null || data.orderId === undefined
      ? null
      : requirePositiveInteger(data.orderId, "orderId");
    const relatedSaleMovementId =
      data.relatedSaleMovementId === null
      || data.relatedSaleMovementId === undefined
        ? null
        : requirePositiveInteger(
          data.relatedSaleMovementId,
          "relatedSaleMovementId",
        );
    assertInternalSaleRelations(
      data.movementType,
      orderId,
      relatedSaleMovementId,
    );
    if (!Number.isInteger(data.balanceAfter) || data.balanceAfter < 0) {
      throw new BusinessRuleViolation(
        "The physical stock can never go negative",
        ErrorCode.INSUFFICIENT_PHYSICAL_STOCK,
        "balanceAfter",
        undefined,
      );
    }
    const balanceBefore = requireNonNegativeInteger(data.balanceBefore, "balanceBefore");
    const balanceAfter = requireNonNegativeInteger(data.balanceAfter, "balanceAfter");
    if (balanceAfter !== balanceBefore + data.quantityDelta) {
      throw new BusinessRuleViolation(
        "The post-movement balance must equal the previous balance plus the delta",
        ErrorCode.INVALID_INPUT,
        "balanceAfter",
        undefined,
      );
    }
    requireInstant(data.createdAt, "createdAt");
    return new StockMovement({
      id: null,
      publicId: requirePublicId(data.publicId, "publicId"),
      variantId: requirePositiveInteger(data.variantId, "variantId"),
      variantPublicId: requirePublicId(data.variantPublicId, "variantPublicId"),
      movementType: data.movementType,
      quantityDelta: data.quantityDelta,
      balanceBefore,
      balanceAfter,
      userId: requirePositiveInteger(data.userId, "userId"),
      reason: shape.reason,
      sourceReference: shape.sourceReference,
      orderId,
      relatedSaleMovementId,
      relatedSalePublicId: shape.relatedSalePublicId,
      createdAt: data.createdAt,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: StockMovementSnapshot): StockMovement {
    return new StockMovement({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get variantId(): number {
    return this.state.variantId;
  }

  get variantPublicId(): string {
    return this.state.variantPublicId;
  }

  get movementType(): StockMovementType {
    return this.state.movementType;
  }

  get quantityDelta(): number {
    return this.state.quantityDelta;
  }

  get balanceBefore(): number {
    return this.state.balanceBefore;
  }

  get balanceAfter(): number {
    return this.state.balanceAfter;
  }

  get userId(): number {
    return this.state.userId;
  }

  get reason(): string {
    return this.state.reason;
  }

  get sourceReference(): string | null {
    return this.state.sourceReference;
  }

  get orderId(): number | null {
    return this.state.orderId ?? null;
  }

  get relatedSaleMovementId(): number | null {
    return this.state.relatedSaleMovementId ?? null;
  }

  get relatedSalePublicId(): string | null {
    return this.state.relatedSalePublicId;
  }

  get createdAt(): string {
    return this.state.createdAt;
  }

  /** Copy of the current state. */
  toSnapshot(): StockMovementSnapshot {
    return { ...this.state };
  }
}

function assertInternalSaleRelations(
  movementType: StockMovementType,
  orderId: number | null,
  relatedSaleMovementId: number | null,
): void {
  if (movementType === StockMovementType.SALE) {
    if (orderId === null) {
      throw new BusinessRuleViolation(
        "A sale movement requires an internal order id",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "orderId",
        undefined,
      );
    }
    if (relatedSaleMovementId !== null) {
      throw new BusinessRuleViolation(
        "A sale movement cannot reference another sale movement",
        ErrorCode.INVALID_INPUT,
        "relatedSaleMovementId",
        undefined,
      );
    }
    return;
  }
  if (
    movementType === StockMovementType.SALE_CANCELLATION
    || movementType === StockMovementType.CUSTOMER_RETURN
  ) {
    if (orderId === null || relatedSaleMovementId === null) {
      throw new BusinessRuleViolation(
        "A reintegration movement requires its order and sale movement ids",
        ErrorCode.REQUIRED_FIELD_MISSING,
        orderId === null ? "orderId" : "relatedSaleMovementId",
        undefined,
      );
    }
    return;
  }
  if (orderId !== null || relatedSaleMovementId !== null) {
    throw new BusinessRuleViolation(
      "This movement type cannot carry sale relations",
      ErrorCode.INVALID_INPUT,
      orderId !== null ? "orderId" : "relatedSaleMovementId",
      undefined,
    );
  }
}

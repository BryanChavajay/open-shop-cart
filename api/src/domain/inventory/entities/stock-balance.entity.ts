import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import { assertMovementShape, requireInstant, requireNonNegativeInteger, requirePositiveInteger, requirePublicId } from "./inventory-rules.js";
import { StockMovementType } from "../enums/stock-movement-type.enum.js";

/**
 * Complete state of a variant's stock balance, used as the persistence contract.
 * Snapshot interfaces are plain data; entities built on them must expose no
 * setters (Phase 2). Quantities are whole units.
 */
export interface StockBalanceSnapshot {
  /** Internal autoincremental identifier of the variant. */
  variantId: number;
  /** Public identifier (UUID v7) of the variant. */
  variantPublicId: string;
  /** Unique SKU of the variant. */
  sku: string;
  /** Name of the owning product. */
  productName: string;
  /** Internal identifier of the owning product. */
  productId: number;
  /** Whether the variant is active. */
  isActive: boolean;
  /** Whether the variant was logically deleted. */
  isDeleted: boolean;
  /** Physical stock units owned by the inventory module. */
  physicalQuantity: number;
  /** Units held by ACTIVE reservations whose expiry is in the future at `asOf`. */
  reservedQuantity: number;
  /** Physical quantity minus reserved quantity at the reference instant. */
  availableQuantity: number;
  /** Last physical stock update, ISO instant (UTC). */
  updatedAt: string;
}

/** Data required to create the balance of a brand-new variant. */
export interface NewStockBalanceData {
  variantId: number;
  variantPublicId: string;
  sku: string;
  productName: string;
  productId: number;
  isActive: boolean;
  isDeleted: boolean;
  /** Units already reserved at creation time. Defaults to zero. */
  reservedQuantity?: number;
  /** Last physical stock update, ISO string (UTC), provided by the use case clock. */
  updatedAt: string;
}

/**
 * Stock balance entity for one variant. Mutations go through `applyMovement`,
 * which enforces the movement rules and the invariants of the physical stock:
 * it can never go negative, and manual adjustments can never fall below the
 * units held by active reservations. The computed `availableQuantity` may be
 * negative when a persisted state has reserved units above the physical stock;
 * the read side reports it as-is instead of hiding the anomaly.
 */
export class StockBalance {
  private state: StockBalanceSnapshot;

  private constructor(state: StockBalanceSnapshot) {
    this.state = state;
  }

  /** Creates the balance of a brand-new variant, starting from zero physical stock. */
  static create(data: NewStockBalanceData): StockBalance {
    const variantId = requirePositiveInteger(data.variantId, "variantId");
    const productId = requirePositiveInteger(data.productId, "productId");
    const reservedQuantity = data.reservedQuantity === undefined ? 0 : requireNonNegativeInteger(data.reservedQuantity, "reservedQuantity");
    requireInstant(data.updatedAt, "updatedAt");
    return new StockBalance({
      variantId,
      variantPublicId: requirePublicId(data.variantPublicId, "variantPublicId"),
      sku: data.sku,
      productName: data.productName,
      productId,
      isActive: data.isActive,
      isDeleted: data.isDeleted,
      physicalQuantity: 0,
      reservedQuantity,
      availableQuantity: -reservedQuantity,
      updatedAt: data.updatedAt,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: StockBalanceSnapshot): StockBalance {
    return new StockBalance({ ...snapshot });
  }

  get variantId(): number {
    return this.state.variantId;
  }

  get variantPublicId(): string {
    return this.state.variantPublicId;
  }

  get sku(): string {
    return this.state.sku;
  }

  get productName(): string {
    return this.state.productName;
  }

  get productId(): number {
    return this.state.productId;
  }

  get isActive(): boolean {
    return this.state.isActive;
  }

  get isDeleted(): boolean {
    return this.state.isDeleted;
  }

  get physicalQuantity(): number {
    return this.state.physicalQuantity;
  }

  get reservedQuantity(): number {
    return this.state.reservedQuantity;
  }

  /**
   * Physical quantity minus reserved quantity. It may be negative when the
   * persisted state has reservations above the physical stock.
   */
  get availableQuantity(): number {
    return this.state.physicalQuantity - this.state.reservedQuantity;
  }

  get updatedAt(): string {
    return this.state.updatedAt;
  }

  /**
   * Applies a signed movement to the balance after enforcing the per-type
   * rules. The movement registry (publicId, createdAt, kardex entry) is built
   * by the use case from the returned balances, never by this entity.
   *
   * @param updatedAt Instant of the movement, ISO string (UTC), provided by
   * the use case clock.
   * @returns The balance before and after the movement, plus the validated
   * delta, so the use case can assemble the matching `StockMovement`.
   */
  applyMovement(
    movementType: StockMovementType,
    quantityDelta: number,
    reason: string,
    sourceReference: string | null,
    relatedSalePublicId: string | null,
    updatedAt: string,
  ): { quantityDelta: number; balanceBefore: number; balanceAfter: number } {
    this.assertNotDeleted();
    assertMovementShape(movementType, quantityDelta, reason, sourceReference, relatedSalePublicId);
    const balanceBefore = this.state.physicalQuantity;
    const balanceAfter = balanceBefore + quantityDelta;
    if (balanceAfter < 0) {
      throw new BusinessRuleViolation(
        "The physical stock can never go negative",
        ErrorCode.INSUFFICIENT_PHYSICAL_STOCK,
        "balanceAfter",
        undefined,
      );
    }
    if (movementType === StockMovementType.MANUAL_ADJUSTMENT && balanceAfter < this.state.reservedQuantity) {
      throw new BusinessRuleViolation(
        "The adjustment would leave the physical stock below the reserved quantity",
        ErrorCode.INSUFFICIENT_PHYSICAL_STOCK,
        "balanceAfter",
        undefined,
      );
    }
    requireInstant(updatedAt, "updatedAt");
    this.state.physicalQuantity = balanceAfter;
    this.state.availableQuantity = balanceAfter - this.state.reservedQuantity;
    this.state.updatedAt = updatedAt;
    return { quantityDelta, balanceBefore, balanceAfter };
  }

  /** Copy of the current state, with the computed availability refreshed. */
  toSnapshot(): StockBalanceSnapshot {
    const snapshot = { ...this.state };
    snapshot.availableQuantity = this.availableQuantity;
    return snapshot;
  }

  private assertNotDeleted(): void {
    if (this.state.isDeleted) {
      throw new BusinessRuleViolation(
        "The stock of a deleted variant cannot be moved",
        ErrorCode.INVALID_CATALOG_ENTITY_STATE,
        undefined,
        undefined,
      );
    }
  }
}

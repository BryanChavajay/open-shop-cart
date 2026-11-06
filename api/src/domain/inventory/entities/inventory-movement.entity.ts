import { StockMovementType } from "../enums/stock-movement-type.enum.js";

/**
 * Complete state of a kardex movement, used as the persistence contract.
 * Snapshot interfaces are plain data; entities built on them must expose no
 * setters (Phase 2). The kardex is append-only: errors are corrected with
 * compensatory movements, never by editing or deleting entries.
 */
export interface StockMovementSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Internal identifier of the variant whose stock moved. */
  variantId: number;
  /** Public identifier of the variant whose stock moved. */
  variantPublicId: string;
  /** Kind of movement. */
  movementType: StockMovementType;
  /** Signed variation applied to the physical stock. Never zero. */
  quantityDelta: number;
  /** Physical stock before the movement. */
  balanceBefore: number;
  /** Physical stock after the movement. */
  balanceAfter: number;
  /** Internal identifier of the user who performed the movement. */
  userId: number;
  /** Mandatory non-empty reason documented by the operator or the process. */
  reason: string;
  /** Optional document reference (invoice, receipt, order...). */
  sourceReference: string | null;
  /** Internal order associated with this sale or reintegration, if any. */
  orderId?: number | null;
  /** Internal SALE movement compensated by this reintegration, if any. */
  relatedSaleMovementId?: number | null;
  /** Public identifier of the sale movement being reintegrated, if any. */
  relatedSalePublicId: string | null;
  /** Creation instant, ISO string (UTC). */
  createdAt: string;
}

import { StockMovementType } from "../enums/stock-movement-type.enum.js";

/**
 * One kardex movement as exposed on reads, with the acting user denormalized.
 */
export interface InventoryMovementReadModel {
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
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
  /** Mandatory reason documented for the movement. */
  reason: string;
  /** Optional document reference (invoice, receipt, order...). */
  sourceReference: string | null;
  /** Public identifier of the sale movement being reintegrated, if any. */
  relatedSalePublicId: string | null;
  /** Public identifier (UUID v7) of the user who performed the movement. */
  userPublicId: string;
  /** Display name of the user who performed the movement. */
  userName: string;
  /** Creation instant, ISO string (UTC). */
  createdAt: string;
}

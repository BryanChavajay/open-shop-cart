import { StockMovement } from "../../../domain/inventory/entities/stock-movement.entity.js";
import type { StockBalance } from "../../../domain/inventory/entities/stock-balance.entity.js";
import { StockMovementType } from "../../../domain/inventory/enums/stock-movement-type.enum.js";
import type { IdentifierGenerator } from "../../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../../domain/shared/interfaces/providers/clock.js";

/**
 * Data used to assemble the kardex movement of a balance change that the
 * `StockBalance` entity already validated and applied. `publicId` and
 * `createdAt` come from the use case identifier generator and clock.
 */
export interface StockMovementAssemblingData {
  identifiers: IdentifierGenerator;
  clock: Clock;
  /** Balance of the variant after the movement was applied. */
  balance: StockBalance;
  movementType: StockMovementType;
  quantityDelta: number;
  balanceBefore: number;
  balanceAfter: number;
  /** Internal identifier of the acting user. */
  userId: number;
  reason: string;
  sourceReference: string | null;
  orderId?: number | null;
  relatedSaleMovementId?: number | null;
  relatedSalePublicId: string | null;
}

/**
 * Builds a validated `StockMovement` entity for a movement already applied to
 * the balance. The shapes of the entity rules (sign, reason, references) were
 * enforced by `StockBalance.applyMovement`; this assembler only supplies the
 * movement registry (publicId, createdAt) and copies the result.
 */
export function assembleStockMovement(data: StockMovementAssemblingData): StockMovement {
  return StockMovement.create({
    publicId: data.identifiers.newPublicId(),
    variantId: data.balance.variantId,
    variantPublicId: data.balance.variantPublicId,
    movementType: data.movementType,
    quantityDelta: data.quantityDelta,
    balanceBefore: data.balanceBefore,
    balanceAfter: data.balanceAfter,
    userId: data.userId,
    reason: data.reason,
    sourceReference: data.sourceReference,
    ...(data.orderId === undefined ? {} : { orderId: data.orderId }),
    ...(data.relatedSaleMovementId === undefined
      ? {}
      : { relatedSaleMovementId: data.relatedSaleMovementId }),
    relatedSalePublicId: data.relatedSalePublicId,
    createdAt: data.clock.now().toISOString(),
  });
}

import { StockMovementType } from "../../domain/inventory/enums/stock-movement-type.enum.js";
import { StockBalance } from "../../domain/inventory/entities/stock-balance.entity.js";
import type {
  IdempotencyOperationData,
  InventoryReadRepository,
  InventoryWriteRepository,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import {
  requirePositiveInteger,
  requirePublicId,
} from "../../domain/inventory/entities/inventory-rules.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";
import type { InventoryActor } from "./shared/dependencies.js";
import { auditEntryForInventory } from "./shared/audit.js";
import { assembleStockMovement } from "./shared/movement-assembler.js";
import { canonicalFingerprint } from "./shared/options.js";
import type { StockOperationResult } from "./receive-purchase-stock.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface ReintegrateCancelledSaleCommand {
  actor: InventoryActor;
  /** Internal identifier of the already-resolved order. */
  orderId: number;
  /** Internal identifier of the variant in the order line. */
  variantId: number;
  /** Public identifier of the variant receiving the units back. */
  variantPublicId: string;
  /** Defaults to the full sold quantity; must not exceed what is pending. */
  quantity?: number | undefined;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

/** Logical operation type recorded in the idempotency ledger. */
export const REINTEGRATE_CANCELLED_SALE_OPERATION = "SALE_CANCELLATION";

/**
 * Reintegrates into the physical stock the units of a cancelled sale: one
 * SALE_CANCELLATION kardex movement (positive delta) linked to the original
 * SALE movement, plus the physical stock change, audit and idempotency receipt
 * inside one transaction.
 *
 * Cumulative protection: the units already reintegrated against the same sale
 * (by cancellations and customer returns) are summed under lock; the
 * reintegration is capped at the sold quantity, so repeated calls cannot
 * over-reintegrate.
 *
 * Idempotency: the operation key is the concrete internal sale movement, so retries of
 * the same cancellation replay the original movement (equal fingerprint) and a
 * different quantity is rejected with ConflictError/IDEMPOTENCY_CONFLICT.
 */
export class ReintegrateCancelledSale {
  constructor(
    private readonly reads: InventoryReadRepository,
    private readonly writes: InventoryWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ReintegrateCancelledSaleCommand,
  ): Promise<StockOperationResult> {
    const orderId = requirePositiveInteger(command.orderId, "orderId");
    const variantId = requirePositiveInteger(command.variantId, "variantId");
    const variantPublicId = requirePublicId(
      command.variantPublicId,
      "variantPublicId",
    );
    requirePositiveInteger(command.actor.id, "actor.id");
    if (command.quantity !== undefined && command.quantity !== null) {
      requirePositiveInteger(command.quantity, "quantity");
    }

    const scope: TransactionScope<StockOperationResult> = async (exec) => {
      const sale = await this.reads.findSaleMovementByOrderAndVariant(
        exec,
        orderId,
        variantId,
      );
      if (sale === null) {
        throw new NotFoundError(
          "Sale movement not found",
          undefined,
          undefined,
          undefined,
        );
      }
      if (sale.movementType !== StockMovementType.SALE) {
        throw new ConflictError(
          "The referenced movement is not a sale",
          undefined,
          "orderId",
          undefined,
        );
      }
      if (sale.variantPublicId !== variantPublicId) {
        throw new ConflictError(
          "The variant does not match the referenced sale movement",
          ErrorCode.INVALID_INPUT,
          "variantPublicId",
          undefined,
        );
      }
      const saleMovementId = requireInternalId(sale.id);
      const quantity = command.quantity ?? Math.abs(sale.quantityDelta);
      const fingerprint = canonicalFingerprint({ saleMovementId, quantity });
      const idempotencyKey = String(saleMovementId);
      const operation = await this.writes.findOperation(
        exec,
        REINTEGRATE_CANCELLED_SALE_OPERATION,
        idempotencyKey,
      );
      if (operation !== null) {
        return this.replayOrReject(operation, fingerprint);
      }

      const now = this.clock.now();
      const asOf = now.toISOString();
      const balances = await this.reads.fetchLockedBalances(
        exec,
        [variantPublicId],
        asOf,
      );
      if (balances.length !== 1) {
        throw new NotFoundError(
          "Variant not found",
          undefined,
          undefined,
          undefined,
        );
      }
      const balance = StockBalance.restore(balances[0]!);
      if (balance.isDeleted) {
        throw new ConflictError(
          "The stock of a deleted variant cannot be moved",
          ErrorCode.INVALID_CATALOG_ENTITY_STATE,
          undefined,
          undefined,
        );
      }

      const soldQuantity = Math.abs(sale.quantityDelta);
      const reintegrated = await this.reads.sumReintegrated(
        exec,
        saleMovementId,
      );
      if (reintegrated + quantity > soldQuantity) {
        throw new ConflictError(
          "The accumulated reintegrations would exceed the sold quantity",
          undefined,
          "quantity",
          undefined,
        );
      }

      const reason = `Reintegration of cancelled sale ${sale.publicId}`;
      const applied = balance.applyMovement(
        StockMovementType.SALE_CANCELLATION,
        quantity,
        reason,
        null,
        null,
        asOf,
      );
      const movement = assembleStockMovement({
        identifiers: this.identifiers,
        clock: this.clock,
        balance,
        movementType: StockMovementType.SALE_CANCELLATION,
        quantityDelta: applied.quantityDelta,
        balanceBefore: applied.balanceBefore,
        balanceAfter: applied.balanceAfter,
        userId: command.actor.id,
        reason,
        sourceReference: null,
        orderId,
        relatedSaleMovementId: saleMovementId,
        relatedSalePublicId: null,
      });

      await this.writes.insertMovement(exec, movement.toSnapshot());
      await this.writes.applyPhysicalStockChange(
        exec,
        balance.variantId,
        applied.quantityDelta,
      );
      await this.audit.append(
        auditEntryForInventory(
          {
            entityType: "StockBalance",
            entityIdentifier: variantPublicId,
            action: AuditAction.UPDATE,
            previousValues: {
              physicalQuantityBefore: applied.balanceBefore,
              physicalQuantityAfter: applied.balanceAfter,
              reason,
              sourceReference: null,
            },
            newValues: {
              physicalQuantityBefore: applied.balanceBefore,
              physicalQuantityAfter: applied.balanceAfter,
              reason,
              sourceReference: null,
            },
          },
          command.actor,
        ),
        exec,
      );
      await this.writes.saveOperation(exec, {
        operationType: REINTEGRATE_CANCELLED_SALE_OPERATION,
        idempotencyKey,
        fingerprint,
        resultPublicId: movement.publicId,
        variantPublicId,
        userId: command.actor.id,
      });
      return { publicId: movement.publicId };
    };

    return runOrJoin(command.joinExecutor ?? null, this.unitOfWork, scope);
  }

  /** Idempotent replay: same content returns the stored result, else conflict. */
  private replayOrReject(
    operation: IdempotencyOperationData,
    fingerprint: string,
  ): StockOperationResult {
    if (operation.fingerprint !== fingerprint) {
      throw new ConflictError(
        "The idempotency key was already used with different content",
        ErrorCode.IDEMPOTENCY_CONFLICT,
        "idempotencyKey",
        undefined,
      );
    }
    if (operation.resultPublicId === null) {
      throw new Error("The recorded operation has no result public id");
    }
    return { publicId: operation.resultPublicId };
  }
}

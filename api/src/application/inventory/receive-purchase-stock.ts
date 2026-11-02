import { StockMovementType } from "../../domain/inventory/enums/stock-movement-type.enum.js";
import { StockBalance } from "../../domain/inventory/entities/stock-balance.entity.js";
import type {
  InventoryWriteRepository,
  IdempotencyOperationData,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { InventoryReadRepository } from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import {
  REFERENCE_MAX_LENGTH,
  requireOptionalTrimmedText,
  requirePositiveInteger,
  requirePublicId,
  requireTrimmedText,
} from "../../domain/inventory/entities/inventory-rules.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";
import type { InventoryActor } from "./shared/dependencies.js";
import { auditEntryForInventory } from "./shared/audit.js";
import { assembleStockMovement } from "./shared/movement-assembler.js";
import { canonicalFingerprint } from "./shared/options.js";

export interface ReceivePurchaseStockCommand {
  actor: InventoryActor;
  /** Public identifier of the variant receiving the units. */
  variantPublicId: string;
  /** Units received; whole and greater than zero. */
  quantity: number;
  /** Mandatory documentation of the receipt. */
  reason: string;
  /** Optional document reference (invoice, receipt...). */
  sourceReference?: string | null | undefined;
  /** Idempotency key of the operation, unique per operation type. */
  idempotencyKey: string;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

/** Result of an idempotent stock write operation. */
export interface StockOperationResult {
  /** Public identifier of the movement created (or replayed) by the operation. */
  publicId: string;
}

/** Logical operation type recorded in the idempotency ledger. */
export const RECEIVE_PURCHASE_STOCK_OPERATION = "PURCHASE_RECEIPT";

/**
 * Registers the receipt of purchased stock into one variant: a kardex
 * PURCHASE_RECEIPT movement plus the physical stock increment, audited and
 * wrapped with an idempotency receipt in a single transaction.
 *
 * The idempotency check runs inside the transaction (against the same executor
 * used by the writes), so concurrent replays of the same key serialize safely:
 * an equal fingerprint replays the original movement without new writes, and a
 * different fingerprint is rejected with ConflictError/IDEMPOTENCY_CONFLICT.
 */
export class ReceivePurchaseStock {
  constructor(
    private readonly reads: InventoryReadRepository,
    private readonly writes: InventoryWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ReceivePurchaseStockCommand,
  ): Promise<StockOperationResult> {
    const variantPublicId = requirePublicId(
      command.variantPublicId,
      "variantPublicId",
    );
    const quantity = requirePositiveInteger(command.quantity, "quantity");
    const reason = requireTrimmedText(command.reason, "reason", 200);
    const sourceReference = requireOptionalTrimmedText(
      command.sourceReference ?? null,
      "sourceReference",
      REFERENCE_MAX_LENGTH,
    );
    const idempotencyKey = requireTrimmedText(
      command.idempotencyKey,
      "idempotencyKey",
      REFERENCE_MAX_LENGTH,
    );
    const fingerprint = canonicalFingerprint({
      variantPublicId,
      quantity,
      reason,
      sourceReference,
    });
    const actorId = requirePositiveInteger(command.actor.id, "actor.id");

    const scope: TransactionScope<StockOperationResult> = async (exec) => {
      const operation = await this.writes.findOperation(
        exec,
        RECEIVE_PURCHASE_STOCK_OPERATION,
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

      const applied = balance.applyMovement(
        StockMovementType.PURCHASE_RECEIPT,
        quantity,
        reason,
        sourceReference,
        null,
        asOf,
      );
      const movement = assembleStockMovement({
        identifiers: this.identifiers,
        clock: this.clock,
        balance,
        movementType: StockMovementType.PURCHASE_RECEIPT,
        quantityDelta: applied.quantityDelta,
        balanceBefore: applied.balanceBefore,
        balanceAfter: applied.balanceAfter,
        userId: actorId,
        reason,
        sourceReference,
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
              sourceReference,
            },
            newValues: {
              physicalQuantityBefore: applied.balanceBefore,
              physicalQuantityAfter: applied.balanceAfter,
              reason,
              sourceReference,
            },
          },
          command.actor,
        ),
        exec,
      );
      await this.writes.saveOperation(exec, {
        operationType: RECEIVE_PURCHASE_STOCK_OPERATION,
        idempotencyKey,
        fingerprint,
        resultPublicId: movement.publicId,
        variantPublicId,
        userId: actorId,
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

import { StockReservation } from "../../domain/inventory/entities/stock-reservation.entity.js";
import type { StockReservationSnapshot } from "../../domain/inventory/entities/stock-reservation.entity.js";
import type {
  InventoryReadRepository,
  InventoryWriteRepository,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { StockReservationStatus } from "../../domain/inventory/enums/reservation-status.enum.js";
import {
  REFERENCE_MAX_LENGTH,
  requirePositiveInteger,
  requireTrimmedText,
} from "../../domain/inventory/entities/inventory-rules.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";
import { RESERVATION_DURATION_MINUTES } from "./shared/options.js";

export interface ReserveStockLineCommand {
  variantPublicId: string;
  /** Units to hold; whole and greater than zero. */
  quantity: number;
}

export interface ReserveStockCommand {
  /** Internal identifier of the user holding the reservation (e.g. a client). */
  userId: number;
  /** Reference of the source that requested the reservation (order draft...). */
  sourceReference: string;
  /** At least one line; the creation is all-or-nothing. */
  lines: ReserveStockLineCommand[];
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

export interface ReservedStockLineReadModel {
  variantPublicId: string;
  quantity: number;
}

export interface ReservedStockReadModel {
  publicId: string;
  /** Expiry instant, ISO string (UTC). At most 15 minutes after creation. */
  expiresAt: string;
  lines: ReservedStockLineReadModel[];
}

/**
 * Holds availability of one or more variants for a limited span: the
 * reservation never touches the physical stock and writes no kardex entries.
 * All lines are locked, validated and created inside a single transaction.
 *
 * Lock and validation order: variants are locked ascending by public id (the
 * read repository serializes the `UPDLOCK` set) so concurrent reservations
 * cannot deadlock; every variant must exist, be non-deleted and active —
 * reservations are reserved for purchase of commercially enabled variants
 * (the product-active check belongs to the catalog/pricing flow); the
 * available quantity computed at the transaction instant must cover each line
 * (ConflictError/INSUFFICIENT_STOCK otherwise).
 *
 * Uniqueness of `sourceReference` (idempotency of the internal operation) is a
 * pre-check plus a persistence guarantee.
 */
export class ReserveStock {
  constructor(
    private readonly reads: InventoryReadRepository,
    private readonly writes: InventoryWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReserveStockCommand): Promise<ReservedStockReadModel> {
    const userId = requirePositiveInteger(command.userId, "userId");
    const sourceReference = requireTrimmedText(
      command.sourceReference,
      "sourceReference",
      REFERENCE_MAX_LENGTH,
    );
    if (!Array.isArray(command.lines) || command.lines.length === 0) {
      throw new ConflictError(
        "A reservation requires at least one line",
        ErrorCode.INVALID_INPUT,
        "lines",
        undefined,
      );
    }
    const seenVariants = new Set<string>();
    for (const line of command.lines) {
      requirePositiveInteger(line.quantity, "quantity");
      const variantPublicId = requireTrimmedText(
        line.variantPublicId,
        "variantPublicId",
        REFERENCE_MAX_LENGTH,
      );
      if (seenVariants.has(variantPublicId)) {
        throw new ConflictError(
          "A reservation cannot reserve the same variant in multiple lines",
          ErrorCode.INVALID_INPUT,
          "lines",
          undefined,
        );
      }
      seenVariants.add(variantPublicId);
    }

    const scope: TransactionScope<ReservedStockReadModel> = async (exec) => {
      const now = this.clock.now();
      const asOf = now.toISOString();
      const existing = await this.reads.findReservationBySourceReference(
        sourceReference,
        asOf,
      );
      if (existing !== null) {
        if (existing.status === StockReservationStatus.ACTIVE) {
          // Idempotent replay: the source already holds an active reservation.
          return this.toReadModel(existing);
        }
        // Other states (consumed, released, expired) keep the unique clash.
        throw new ConflictError(
          "The sourceReference was already used by another reservation",
          undefined,
          "sourceReference",
          undefined,
        );
      }

      const balances = await this.reads.fetchLockedBalances(
        exec,
        [...seenVariants].toSorted(),
        asOf,
      );
      if (balances.length !== seenVariants.size) {
        throw new NotFoundError(
          "Variant not found",
          undefined,
          undefined,
          undefined,
        );
      }
      const balancesByPublicId = new Map(
        balances.map((balance) => [balance.variantPublicId, balance]),
      );

      for (const line of command.lines) {
        const balance = balancesByPublicId.get(line.variantPublicId);
        if (balance === undefined) {
          throw new NotFoundError(
            "Variant not found",
            undefined,
            undefined,
            undefined,
          );
        }
        if (balance.isDeleted) {
          throw new ConflictError(
            "The stock of a deleted variant cannot be reserved",
            ErrorCode.INVALID_CATALOG_ENTITY_STATE,
            undefined,
            undefined,
          );
        }
        if (!balance.isActive) {
          // Reservations are only accepted for commercially enabled variants.
          throw new ConflictError(
            "The variant is inactive and cannot be reserved",
            ErrorCode.INVALID_CATALOG_ENTITY_STATE,
            undefined,
            undefined,
          );
        }
        if (balance.availableQuantity < line.quantity) {
          throw new ConflictError(
            "The available quantity does not cover the requested reservation",
            ErrorCode.INSUFFICIENT_STOCK,
            "lines",
            undefined,
          );
        }
      }

      const reservationDurationMs = RESERVATION_DURATION_MINUTES * 60 * 1000;
      const reservation = StockReservation.create({
        publicId: this.identifiers.newPublicId(),
        sourceReference,
        userId,
        createdAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + reservationDurationMs,
        ).toISOString(),
        lines: command.lines.map((line) => ({
          publicId: this.identifiers.newPublicId(),
          variantId: balancesByPublicId.get(line.variantPublicId)!.variantId,
          variantPublicId: line.variantPublicId,
          quantity: line.quantity,
        })),
      });

      await this.writes.insertReservation(exec, reservation.toSnapshot());
      return this.toReadModel(reservation.toSnapshot());
    };

    return runOrJoin(command.joinExecutor ?? null, this.unitOfWork, scope);
  }

  /** Maps a reservation snapshot into its read model. */
  private toReadModel(
    snapshot: StockReservationSnapshot,
  ): ReservedStockReadModel {
    return {
      publicId: snapshot.publicId,
      expiresAt: snapshot.expiresAt,
      lines: snapshot.lines.map((line) => ({
        variantPublicId: line.variantPublicId,
        quantity: line.quantity,
      })),
    };
  }
}

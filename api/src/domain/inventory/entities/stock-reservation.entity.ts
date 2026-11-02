import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import { RESERVATION_MAX_DURATION_MS, REFERENCE_MAX_LENGTH, requireInstant, requirePositiveInteger, requirePublicId, requireTrimmedText } from "./inventory-rules.js";
import { StockReservationStatus } from "../enums/reservation-status.enum.js";

/**
 * One variant line of a stock reservation. Snapshot interfaces are plain data;
 * entities built on them must expose no setters (Phase 2).
 */
export interface ReservationLineSnapshot {
  /** Public identifier (UUID v7) of the line. */
  publicId: string;
  /** Internal identifier of the reserved variant. */
  variantId: number;
  /** Public identifier of the reserved variant. */
  variantPublicId: string;
  /** Reserved units of the variant. Whole and greater than zero. */
  quantity: number;
}

/**
 * Complete state of a stock reservation, used as the persistence contract.
 * Reservations never change the physical stock and never write kardex entries;
 * their traceability lives in the reservation history ledger.
 */
export interface StockReservationSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Reference of the source that requested the reservation (order draft...). */
  sourceReference: string;
  /** Internal identifier of the user who created the reservation. */
  userId: number;
  /** Current lifecycle state. */
  status: StockReservationStatus;
  /** Creation instant, ISO string (UTC). */
  createdAt: string;
  /** Expiry instant, ISO string (UTC). Reservations last 15 minutes. */
  expiresAt: string;
  /** Reserved lines. Creation is all-or-nothing. */
  lines: ReservationLineSnapshot[];
}

/** Data required to create a new stock reservation. */
export interface NewReservationData {
  publicId: string;
  sourceReference: string;
  userId: number;
  /** Creation instant, ISO string (UTC), provided by the use case clock. */
  createdAt: string;
  /** Expiry instant, ISO string (UTC). At most 15 minutes after creation. */
  expiresAt: string;
  lines: ReservationLineSnapshot[];
}

/**
 * Stock reservation entity. Reservations hold availability without touching
 * the physical stock. The header and its lines are immutable after creation;
 * only the lifespan state transitions (consume, release, expire) through the
 * exposed methods are allowed, each with its own state assertions.
 */
export class StockReservation {
  private state: StockReservationSnapshot;

  private constructor(state: StockReservationSnapshot) {
    this.state = state;
  }

  /** Creates and validates a new reservation in the ACTIVE state. */
  static create(data: NewReservationData): StockReservation {
    if (!Array.isArray(data.lines) || data.lines.length === 0) {
      throw new BusinessRuleViolation(
        "A reservation requires at least one line",
        ErrorCode.INVALID_INPUT,
        "lines",
        undefined,
      );
    }
    const seenVariants = new Set<string>();
    for (const line of data.lines) {
      requirePublicId(line.publicId, "publicId");
      requirePositiveInteger(line.variantId, "variantId");
      requirePublicId(line.variantPublicId, "variantPublicId");
      requirePositiveInteger(line.quantity, "quantity");
      if (seenVariants.has(line.variantPublicId)) {
        throw new BusinessRuleViolation(
          "A reservation cannot reserve the same variant in multiple lines",
          ErrorCode.INVALID_INPUT,
          "lines",
          undefined,
        );
      }
      seenVariants.add(line.variantPublicId);
    }
    const createdAt = requireInstant(data.createdAt, "createdAt");
    const expiresAt = requireInstant(data.expiresAt, "expiresAt");
    const durationMs = expiresAt.getTime() - createdAt.getTime();
    if (durationMs <= 0) {
      throw new BusinessRuleViolation(
        "The reservation expiry must be after its creation",
        ErrorCode.INVALID_INPUT,
        "expiresAt",
        undefined,
      );
    }
    if (durationMs > RESERVATION_MAX_DURATION_MS) {
      throw new BusinessRuleViolation(
        `The reservation expiry exceeds ${RESERVATION_MAX_DURATION_MS / 60000} minutes after its creation`,
        ErrorCode.INVALID_INPUT,
        "expiresAt",
        undefined,
      );
    }
    return new StockReservation({
      id: null,
      publicId: requirePublicId(data.publicId, "publicId"),
      sourceReference: requireTrimmedText(data.sourceReference, "sourceReference", REFERENCE_MAX_LENGTH),
      userId: requirePositiveInteger(data.userId, "userId"),
      status: StockReservationStatus.ACTIVE,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      lines: data.lines.map((line) => ({ ...line })),
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: StockReservationSnapshot): StockReservation {
    return new StockReservation({
      ...snapshot,
      lines: snapshot.lines.map((line) => ({ ...line })),
    });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get sourceReference(): string {
    return this.state.sourceReference;
  }

  get userId(): number {
    return this.state.userId;
  }

  get status(): StockReservationStatus {
    return this.state.status;
  }

  get createdAt(): string {
    return this.state.createdAt;
  }

  get expiresAt(): string {
    return this.state.expiresAt;
  }

  get lines(): ReservationLineSnapshot[] {
    return this.state.lines.map((line) => ({ ...line }));
  }

  /**
   * True when the reservation deadline has already passed at `asOf`.
   */
  isExpired(asOf: string): boolean {
    return requireInstant(this.state.expiresAt, "expiresAt").getTime() <= requireInstant(asOf, "asOf").getTime();
  }

  /**
   * Asserts that the reservation can be consumed at `asOf`: it must be ACTIVE
   * and its deadline must still be in the future.
   */
  assertConsume(asOf: string): void {
    if (this.isExpired(asOf)) {
      throw new BusinessRuleViolation(
        "The reservation is expired and cannot be consumed",
        ErrorCode.STOCK_RESERVATION_EXPIRED,
        undefined,
        undefined,
      );
    }
    if (this.state.status !== StockReservationStatus.ACTIVE) {
      throw new BusinessRuleViolation(
        "Only an active reservation can be consumed",
        ErrorCode.STOCK_RESERVATION_INVALID_STATE,
        undefined,
        undefined,
      );
    }
  }

  /** Marks the reservation as consumed. Repeats the consumption assertions. */
  consume(asOf: string): void {
    this.assertConsume(asOf);
    this.state.status = StockReservationStatus.CONSUMED;
  }

  /** Manually releases the reservation before its deadline. */
  release(): void {
    if (this.state.status !== StockReservationStatus.ACTIVE) {
      throw new BusinessRuleViolation(
        "Only an active reservation can be released",
        ErrorCode.STOCK_RESERVATION_INVALID_STATE,
        undefined,
        undefined,
      );
    }
    this.state.status = StockReservationStatus.RELEASED;
  }

  /**
   * Marks a deadline-passed ACTIVE reservation as expired. Only the automatic
   * expiry flow may call this.
   */
  expire(asOf: string): void {
    if (this.state.status !== StockReservationStatus.ACTIVE || !this.isExpired(asOf)) {
      throw new BusinessRuleViolation(
        "Only an active reservation whose deadline has passed can be expired",
        ErrorCode.STOCK_RESERVATION_INVALID_STATE,
        undefined,
        undefined,
      );
    }
    this.state.status = StockReservationStatus.EXPIRED;
  }

  /** Copy of the current state, including defensive copies of the lines. */
  toSnapshot(): StockReservationSnapshot {
    return {
      ...this.state,
      lines: this.state.lines.map((line) => ({ ...line })),
    };
  }
}

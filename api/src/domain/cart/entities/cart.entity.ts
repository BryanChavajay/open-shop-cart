import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import { CartStatus } from "../enums/cart-status.enum.js";

/** Data required to create a new guest cart. */
export interface NewCartData {
  publicId: string;
  /** SHA-256 hash of the opaque cart token; the raw token is never stored. */
  tokenHash: string;
  userId: number | null;
  /** Creation instant, ISO string (UTC), provided by the use case clock. */
  createdAt: string;
}

/**
 * Complete state of a guest cart, used as the persistence contract. The cart
 * exists only to detect abandoned carts: it holds no line items and no
 * commercial amounts, just the identity token and its activity instants.
 */
export interface CartSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** SHA-256 hash of the opaque cart token. */
  tokenHash: string;
  /** Internal identifier of the bound user, null while the cart is guest-only. */
  userId: number | null;
  /** Current lifecycle state. */
  status: CartStatus;
  /** Creation instant, ISO string (UTC). */
  createdAt: string;
  /** Last activity instant, ISO string (UTC). Initial value equals creation. */
  lastActivityAt: string;
  /** Closing instant of the EMPTIED or CONVERTED transition, null otherwise. */
  closedAt: string | null;
}

/** Accepts non-empty text, trimmed. */
function requireNonEmptyText(value: string, field: string): string {
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

/** Accepts an ISO instant that `Date` can parse into a finite timestamp. */
function requireInstant(value: string, field: string): Date {
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

/** Accepts an optional internal user identifier, validated only when present. */
function requireOptionalUserId(value: number | null, field: string): number | null {
  if (value === null) {
    return null;
  }
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

/**
 * Guest cart entity. Carts carry only identity and activity instants, no
 * line content. Non-ACTIVE states are terminal (EMPTIED, CONVERTED), so the
 * only transitions allowed are `empty` and `convert`, both starting from
 * ACTIVE and each with its own state assertions.
 */
export class Cart {
  private state: CartSnapshot;

  private constructor(state: CartSnapshot) {
    this.state = state;
  }

  /** Creates and validates a new cart in the ACTIVE state. */
  static create(data: NewCartData): Cart {
    return new Cart({
      id: null,
      publicId: requireNonEmptyText(data.publicId, "publicId"),
      tokenHash: requireNonEmptyText(data.tokenHash, "tokenHash"),
      userId: requireOptionalUserId(data.userId, "userId"),
      status: CartStatus.ACTIVE,
      createdAt: data.createdAt,
      lastActivityAt: data.createdAt,
      closedAt: null,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: CartSnapshot): Cart {
    return new Cart({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get tokenHash(): string {
    return this.state.tokenHash;
  }

  get userId(): number | null {
    return this.state.userId;
  }

  get status(): CartStatus {
    return this.state.status;
  }

  get createdAt(): string {
    return this.state.createdAt;
  }

  get lastActivityAt(): string {
    return this.state.lastActivityAt;
  }

  get closedAt(): string | null {
    return this.state.closedAt;
  }

  /**
   * Records new activity on the cart. Only an ACTIVE cart can be touched and
   * the instant cannot predate its creation.
   */
  touch(asOf: string): void {
    if (this.state.status !== CartStatus.ACTIVE) {
      throw new BusinessRuleViolation(
        "Only an active cart can register activity",
        ErrorCode.INVALID_CART_STATE,
        undefined,
        undefined,
      );
    }
    if (requireInstant(asOf, "asOf").getTime() < requireInstant(this.state.createdAt, "createdAt").getTime()) {
      throw new BusinessRuleViolation(
        "The activity instant cannot be before the cart creation",
        ErrorCode.INVALID_INPUT,
        "asOf",
        undefined,
      );
    }
    this.state.lastActivityAt = asOf;
  }

  /** Clears the cart on the shopper's request, closing it as EMPTIED. */
  empty(asOf: string): void {
    if (this.state.status !== CartStatus.ACTIVE) {
      throw new BusinessRuleViolation(
        "Only an active cart can be emptied",
        ErrorCode.INVALID_CART_STATE,
        undefined,
        undefined,
      );
    }
    this.state.status = CartStatus.EMPTIED;
    this.state.closedAt = asOf;
  }

  /** Marks the cart as converted into an order, closing it as CONVERTED. */
  convert(asOf: string): void {
    if (this.state.status !== CartStatus.ACTIVE) {
      throw new BusinessRuleViolation(
        "Only an active cart can be converted",
        ErrorCode.INVALID_CART_STATE,
        undefined,
        undefined,
      );
    }
    this.state.status = CartStatus.CONVERTED;
    this.state.closedAt = asOf;
  }

  /** Copy of the current state. */
  toSnapshot(): CartSnapshot {
    return { ...this.state };
  }
}

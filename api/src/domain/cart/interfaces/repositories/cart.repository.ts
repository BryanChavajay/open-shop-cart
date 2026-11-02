import type { CommandExecutor } from "../../../shared/interfaces/providers/sql-executor.js";
import type { PaginatedReadModel } from "../../../shared/readmodels/paginated.read-model.js";
import type { CartSnapshot } from "../../entities/cart.entity.js";
import type { CartStatus } from "../../enums/cart-status.enum.js";

/**
 * Persisted data of one abandoned cart. `abandonedAt` is derivable from
 * `lastActivityAt` plus the inactivity window, so compute-based read models
 * extend this shape instead of the repository computing it.
 */
export interface AbandonedCartRow {
  /** Public identifier (UUID v7) of the cart. */
  publicId: string;
  /** Public identifier of the bound user, null while the cart is guest-only. */
  userPublicId: string | null;
  /** Creation instant, ISO string (UTC). */
  createdAt: string;
  /** Last activity instant, ISO string (UTC). The abandonment signal. */
  lastActivityAt: string;
  /** Closing instant of the EMPTIED transition, ISO string (UTC), else null. */
  closedAt: string | null;
}

/** Report item of one abandoned cart, with the computed abandonment instant. */
export interface AbandonedCartListItem extends AbandonedCartRow {
  /** Instant when the cart crossed the inactivity threshold, ISO string (UTC). */
  abandonedAt: string;
}

/**
 * Read-only data access for carts. Every method takes an `executor` bound to
 * the caller's transaction, or null for standalone reads; no method opens
 * transactions. Business validation is the responsibility of use cases and
 * entities: the persistence layer only executes queries and propagates their
 * failures.
 */
export interface CartReadRepository {
  /**
   * Cart with the given token hash only when it is ACTIVE. Null otherwise;
   * closes or converted carts never match. Plain read used as the gateway of
   * every cart operation that takes a raw token.
   */
  findActiveByTokenHash(executor: CommandExecutor | null, tokenHash: string): Promise<CartSnapshot | null>;
  /**
   * Paginated carts still ACTIVE whose `lastActivityAt` predates `cutoffIso`
   * (abandoned carts), oldest activity first.
   */
  listAbandoned(
    executor: CommandExecutor | null,
    cutoffIso: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedReadModel<AbandonedCartRow>>;
}

/**
 * Write-side data access for the cart module. Every method takes an
 * `executor` bound to the caller's transaction, or null to let the
 * persistence layer manage its own; no method opens transactions. The
 * boolean results are false when the targeted cart was concurrently closed
 * between read and write, letting use cases fall back to the correct flow.
 */
export interface CartWriteRepository {
  /**
   * Persists a new cart. The snapshot id is null on input; it persists as
   * sent by the use case.
   */
  create(executor: CommandExecutor | null, cart: CartSnapshot): Promise<void>;
  /**
   * Moves the cart's `lastActivityAt` to `asOfIso`. False when the cart was
   * no longer ACTIVE (raced by a concurrent closing).
   */
  updateActivity(executor: CommandExecutor | null, cartId: number, asOfIso: string): Promise<boolean>;
  /**
   * Transitions the cart status (ACTIVE → EMPTIED/CONVERTED) and sets its
   * `closedAt` to `asOfIso`. False when the cart was no longer ACTIVE.
   */
  changeStatus(executor: CommandExecutor | null, cartId: number, status: CartStatus, asOfIso: string): Promise<boolean>;
}

/** Combined read/write port of the cart module for callers needing both sides. */
export type CartRepository = CartReadRepository & CartWriteRepository;

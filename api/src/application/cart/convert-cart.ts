import { Cart } from "../../domain/cart/entities/cart.entity.js";
import type { CartReadRepository, CartWriteRepository } from "../../domain/cart/interfaces/repositories/cart.repository.js";
import type { OpaqueTokenGenerator } from "../../domain/shared/interfaces/providers/opaque-token-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface ConvertCartCommand {
  /** Raw cart token carried by the client cookie; it must identify an ACTIVE cart. */
  token: string | null | undefined;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

export interface ConvertedCartReadModel {
  publicId: string;
  /** Conversion instant, ISO string (UTC). */
  convertedAt: string;
}

/** Drops null, undefined and blank tokens: there is no cart to resume. */
function normalizeToken(token: string | null | undefined): string | null {
  if (token === null || token === undefined) {
    return null;
  }
  const trimmed = token.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Closes the guest cart as CONVERTED when it holds an order. It is meant to
 * be called internally by the future checkout flow (inside or before its
 * transaction), never by HTTP, so the result is a read model for the caller
 * rather than a presentation artifact.
 *
 * Missing tokens and unknown or concurrent-closed carts are business errors,
 * because conversion without an active cart means the order referenced a
 * cart that was emptied or already converted, and the caller must react.
 */
export class ConvertCart {
  constructor(
    private readonly reads: CartReadRepository,
    private readonly writes: CartWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly tokens: OpaqueTokenGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: ConvertCartCommand): Promise<ConvertedCartReadModel> {
    const token = normalizeToken(command.token);
    const scope: TransactionScope<ConvertedCartReadModel> = async (exec) => {
      if (token === null) {
        throw new BusinessRuleViolation(
          "The cart does not exist or is not active",
          ErrorCode.CART_NOT_FOUND,
          undefined,
          undefined,
        );
      }
      const snapshot = await this.reads.findActiveByTokenHash(exec, this.tokens.hash(token));
      if (snapshot === null) {
        throw new BusinessRuleViolation(
          "The cart does not exist or is not active",
          ErrorCode.CART_NOT_FOUND,
          undefined,
          undefined,
        );
      }
      const now = this.clock.now().toISOString();
      const cart = Cart.restore(snapshot);
      cart.convert(now);
      const changed = await this.writes.changeStatus(
        exec,
        requireInternalId(cart.id),
        cart.status,
        now,
      );
      if (!changed) {
        // Raced by a concurrent closing: the cart is no longer convertible.
        throw new BusinessRuleViolation(
          "The cart does not exist or is not active",
          ErrorCode.CART_NOT_FOUND,
          undefined,
          undefined,
        );
      }
      return { publicId: cart.publicId, convertedAt: cart.closedAt! };
    };
    return runOrJoin(command.joinExecutor ?? null, this.unitOfWork, scope);
  }
}

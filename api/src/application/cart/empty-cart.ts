import { Cart } from "../../domain/cart/entities/cart.entity.js";
import type { CartReadRepository, CartWriteRepository } from "../../domain/cart/interfaces/repositories/cart.repository.js";
import type { OpaqueTokenGenerator } from "../../domain/shared/interfaces/providers/opaque-token-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { UnitOfWork } from "../shared/unit-of-work.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface EmptyCartCommand {
  /** Raw cart token carried by the client cookie; missing means nothing to do. */
  token: string | null | undefined;
}

export interface EmptyCartResult {
  /** True when an active cart was actually closed as EMPTIED. */
  closed: boolean;
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
 * Clears the guest cart on the shopper's request, closing it as EMPTIED.
 * It is deliberately idempotent: a missing token, an unknown token hash or a
 * cart already closed all report `{ closed: false }` instead of failing, and
 * a race with a concurrent closing is absorbed through the `changeStatus`
 * boolean result with the same neutral answer.
 */
export class EmptyCart {
  constructor(
    private readonly reads: CartReadRepository,
    private readonly writes: CartWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly tokens: OpaqueTokenGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: EmptyCartCommand): Promise<EmptyCartResult> {
    const token = normalizeToken(command.token);
    if (token === null) {
      return { closed: false };
    }
    const tokenHash = this.tokens.hash(token);

    return this.unitOfWork.run(async (exec) => {
      const snapshot = await this.reads.findActiveByTokenHash(exec, tokenHash);
      if (snapshot === null) {
        // Nothing open to clear: already emptied, converted or never created.
        return { closed: false };
      }
      const now = this.clock.now().toISOString();
      const cart = Cart.restore(snapshot);
      cart.empty(now);
      const changed = await this.writes.changeStatus(
        exec,
        requireInternalId(cart.id),
        cart.status,
        now,
      );
      return { closed: changed };
    });
  }
}

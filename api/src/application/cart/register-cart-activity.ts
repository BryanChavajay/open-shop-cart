import { Cart } from "../../domain/cart/entities/cart.entity.js";
import type {
  CartReadRepository,
  CartWriteRepository,
} from "../../domain/cart/interfaces/repositories/cart.repository.js";
import type { OpaqueTokenGenerator } from "../../domain/shared/interfaces/providers/opaque-token-generator.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import type { UnitOfWork } from "../shared/unit-of-work.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface RegisterCartActivityCommand {
  /** Raw cart token carried by the client cookie; null on the first visit. */
  token: string | null | undefined;
  /** Optional user binding; accepted for compatibility with the future linking flow. */
  userId?: number | null | undefined;
}

export interface CartActivityResult {
  /** True when a new cart (and a new token) had to be created. */
  created: boolean;
  /** Newly generated raw token, null when an existing cart was touched. */
  token: string | null;
  /** The cart has no user binding yet. */
  userId: null;
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
 * Registers one activity beat on the guest cart identified by the raw token,
 * creating the cart on the first visit. The cart holds no line content: it
 * exists to keep `lastActivityAt` fresh for the abandoned-cart report.
 *
 * The whole flow runs in one transaction: an existing token is looked up by
 * its hash and the activity is persisted through `updateActivity`, whose
 * boolean result absorbs the race with a concurrent closing. A raced or
 * missing cart falls back to creating a brand-new cart and token, so the
 * client always ends up with a resumable one.
 */
export class RegisterCartActivity {
  constructor(
    private readonly reads: CartReadRepository,
    private readonly writes: CartWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly tokens: OpaqueTokenGenerator,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RegisterCartActivityCommand,
  ): Promise<CartActivityResult> {
    const suppliedToken = normalizeToken(command.token);
    const suppliedTokenHash =
      suppliedToken === null ? null : this.tokens.hash(suppliedToken);

    return this.unitOfWork.run(async (exec) => {
      if (suppliedTokenHash !== null) {
        const existing = await this.reads.findActiveByTokenHash(
          exec,
          suppliedTokenHash,
        );
        if (existing !== null) {
          const now = this.clock.now().toISOString();
          const cart = Cart.restore(existing);
          cart.touch(now);
          const updated = await this.writes.updateActivity(
            exec,
            requireInternalId(cart.id),
            cart.lastActivityAt,
          );
          if (updated) {
            // Idempotent replay: the visitor resumes the same active cart.
            return { created: false, token: null, userId: null };
          }
          // Raced by a concurrent closing: fall back to a brand-new cart.
        }
      }
      return this.createCart(exec, command.userId ?? null);
    });
  }

  /** Creates a fresh cart with a newly generated token and its hash. */
  private async createCart(
    exec: CommandExecutor,
    userId: number | null,
  ): Promise<CartActivityResult> {
    const token = this.tokens.generate();
    const now = this.clock.now().toISOString();
    const cart = Cart.create({
      publicId: this.identifiers.newPublicId(),
      tokenHash: this.tokens.hash(token),
      userId,
      createdAt: now,
    });
    await this.writes.create(exec, cart.toSnapshot());
    return { created: true, token, userId: null };
  }
}

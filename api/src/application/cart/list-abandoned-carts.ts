import type {
  CartReadRepository,
  AbandonedCartRow,
  AbandonedCartListItem,
} from "../../domain/cart/interfaces/repositories/cart.repository.js";
import type { PaginatedReadModel } from "../../domain/shared/readmodels/paginated.read-model.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

/** Default listing parameters, aligned with the rest of the modules. */
export const ABANDONED_CARTS_DEFAULT_PAGE = 1;
export const ABANDONED_CARTS_DEFAULT_PAGE_SIZE = 100;

export interface ListAbandonedCartsQuery {
  /** Page number, starting at 1. Defaults to 1. */
  page?: number | undefined;
  /** Page size in rows, capped at 100. Defaults to 100. */
  pageSize?: number | undefined;
}

/**
 * Builds the abandoned-cart report: ACTIVE carts whose `lastActivityAt`
 * crossed the inactivity window before the current instant. The window is
 * injected in the constructor so the application layer never imports env
 * configuration.
 *
 * The repository filters by `cutoff` (`now` minus the inactivity window) and
 * the use case computes each item's `abandonedAt` (`lastActivityAt` plus the
 * same window), keeping persistence free of derived instants.
 */
export class ListAbandonedCarts {
  constructor(
    private readonly reads: CartReadRepository,
    private readonly clock: Clock,
    private readonly abandonmentInactivityDays: number,
  ) {}

  async execute(
    query: ListAbandonedCartsQuery,
  ): Promise<PaginatedReadModel<AbandonedCartListItem>> {
    const inactivityDays = this.requireInactivityDays();
    const page = query.page ?? ABANDONED_CARTS_DEFAULT_PAGE;
    const pageSize = query.pageSize ?? ABANDONED_CARTS_DEFAULT_PAGE_SIZE;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new BusinessRuleViolation(
        "Pagination is invalid",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }

    const inactivityMs = inactivityDays * 24 * 60 * 60 * 1000;
    const cutoff = new Date(
      this.clock.now().getTime() - inactivityMs,
    ).toISOString();
    const rows = await this.reads.listAbandoned(null, cutoff, page, pageSize);

    return {
      ...rows,
      items: rows.items.map((row) => this.toListItem(row, inactivityMs)),
    };
  }

  /** Guards the injected inactivity window; wiring errors surface early. */
  private requireInactivityDays(): number {
    if (
      !Number.isInteger(this.abandonmentInactivityDays) ||
      this.abandonmentInactivityDays < 1
    ) {
      throw new BusinessRuleViolation(
        "The abandonment inactivity window must be at least one whole day",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    return this.abandonmentInactivityDays;
  }

  /** Adds the computed abandonment instant to the reported item. */
  private toListItem(
    row: AbandonedCartRow,
    inactivityMs: number,
  ): AbandonedCartListItem {
    const abandonedAt = new Date(
      new Date(row.lastActivityAt).getTime() + inactivityMs,
    ).toISOString();
    return { ...row, abandonedAt };
  }
}

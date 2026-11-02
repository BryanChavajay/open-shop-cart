import type {
  InventoryReadRepository,
  MovementListFilter,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { PaginatedReadModel } from "../../domain/shared/readmodels/paginated.read-model.js";
import type { InventoryMovementReadModel } from "../../domain/inventory/readmodels/inventory-movement.read-model.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { requirePublicId } from "../../domain/inventory/entities/inventory-rules.js";

export type ListVariantKardexQuery = MovementListFilter;

/**
 * Paginated kardex listing of one variant. The variant must exist; unknown
 * variants report NotFoundError before consulting movements.
 */
export class ListVariantKardex {
  constructor(
    private readonly reads: InventoryReadRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: ListVariantKardexQuery,
  ): Promise<PaginatedReadModel<InventoryMovementReadModel>> {
    requirePublicId(query.variantPublicId, "variantPublicId");
    const snapshot = await this.reads.findBalanceByPublicId(
      query.variantPublicId,
      this.clock.now().toISOString(),
    );
    if (snapshot === null) {
      throw new NotFoundError(
        "Variant not found",
        ErrorCode.STOCK_NOT_FOUND,
        undefined,
        undefined,
      );
    }
    return await this.reads.listMovements(query);
  }
}

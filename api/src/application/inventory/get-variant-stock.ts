import type { VariantStockReadModel } from "../../domain/inventory/readmodels/variant-stock.read-model.js";
import type { InventoryReadRepository } from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { requirePublicId } from "../../domain/inventory/entities/inventory-rules.js";

export interface GetVariantStockQuery {
  variantPublicId: string;
}

/** Full stock balance of one variant, addressed by its public identifier. */
export class GetVariantStock {
  constructor(
    private readonly reads: InventoryReadRepository,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetVariantStockQuery): Promise<VariantStockReadModel> {
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
    return {
      variantPublicId: snapshot.variantPublicId,
      sku: snapshot.sku,
      productName: snapshot.productName,
      isActive: snapshot.isActive,
      isDeleted: snapshot.isDeleted,
      physicalQuantity: snapshot.physicalQuantity,
      reservedQuantity: snapshot.reservedQuantity,
      availableQuantity: snapshot.availableQuantity,
      updatedAt: snapshot.updatedAt,
    };
  }
}

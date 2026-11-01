import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { TaxCalculator } from "../../domain/shared/interfaces/providers/tax-calculator.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import type { FullAdminProductReadModel } from "../../domain/catalog/readmodels/product-admin.read-model.js";
import { assembleFullProduct } from "./shared/product-assembler.js";

export interface GetProductQuery {
  publicId: string;
}

/**
 * Admin product detail composed from its parts (product, variants with SKU and
 * combos, options and images). Deleted or missing products report NotFoundError.
 */
export class GetProduct {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly taxCalculator: TaxCalculator,
  ) {}

  async execute(query: GetProductQuery): Promise<FullAdminProductReadModel> {
    const full = await assembleFullProduct(
      this.reads,
      this.taxCalculator,
      query.publicId,
    );
    if (full === null) {
      throw new NotFoundError(
        "Product not found",
        undefined,
        undefined,
        undefined,
      );
    }
    return full;
  }
}

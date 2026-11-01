import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { TaxCalculator } from "../../domain/shared/interfaces/providers/tax-calculator.js";
import type { PublicProductDetailReadModel } from "../../domain/catalog/readmodels/public-catalog.read-model.js";
import { assemblePublicProduct } from "./shared/product-assembler.js";

export interface GetPublicProductQuery {
  publicId: string;
}

/**
 * Public product detail. Returns null (does NOT throw) when the product does
 * not exist, is inactive or is logically deleted. The variants are the active,
 * non-deleted ones; no SKU is published and prices travel tax-inclusive.
 */
export class GetPublicProduct {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly taxCalculator: TaxCalculator,
  ) {}

  async execute(
    query: GetPublicProductQuery,
  ): Promise<PublicProductDetailReadModel | null> {
    return assemblePublicProduct(
      this.reads,
      this.taxCalculator,
      query.publicId,
    );
  }
}

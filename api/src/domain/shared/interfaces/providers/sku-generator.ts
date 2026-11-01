export interface SkuGenerationContext {
  categoryName: string;
  brandName: string;
  productName: string;
}

/** SKU generation for product variants. */
export interface SkuGenerator {
  /**
   * Returns a unique SKU candidate; uniqueness is finally enforced at
   * persistence time (unique index).
   */
  generateSku(context: SkuGenerationContext): string;
}

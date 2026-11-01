/** Option value selected by a variant, as exposed by admin endpoints. */
export interface VariantOptionValueReadModel {
  /** Public identifier (UUID v7) of the option value. */
  publicId: string;
  /** Public identifier of the owning option. */
  optionPublicId: string;
  value: string;
}

/**
 * Variant as exposed by the admin endpoints. The SKU is admin-only; the
 * tax-inclusive price is derived with the TaxCalculator during mapping.
 */
export interface VariantAdminReadModel {
  /** Public identifier (UUID v7). */
  publicId: string;
  /** Internal identifier of the owning product. */
  productId: number;
  sku: string;
  name: string;
  /** Own cost in currency units; null when unknown. */
  unitCost: number | null;
  /** Net (pre-tax) sale price. */
  unitPrice: number;
  coverImage: import("./product-image.read-model.js").ProductImageReadModel | null;
  images: import("./product-image.read-model.js").ProductImageReadModel[];
  /** Tax-inclusive sale price, derived during mapping. */
  priceIncludingTax: number;
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  optionValues: VariantOptionValueReadModel[];
}

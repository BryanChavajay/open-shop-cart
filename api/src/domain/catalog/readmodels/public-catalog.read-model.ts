/** Single option value of a public option. */
export interface PublicOptionValueReadModel {
  /** Public identifier (UUID v7). */
  publicId: string;
  value: string;
}

/** Option with its values, as exposed by public endpoints. */
export interface PublicOptionReadModel {
  /** Public identifier (UUID v7). */
  publicId: string;
  name: string;
  values: PublicOptionValueReadModel[];
}

/** Value of an option selected by a public variant. */
export interface PublicVariantOptionValueReadModel {
  /** Public identifier (UUID v7) of the option value. */
  publicId: string;
  /** Public identifier of the owning option. */
  optionPublicId: string;
  value: string;
}

/**
 * Variant as exposed by public endpoints. The SKU is never published
 * (admin-only information) and prices travel tax-inclusive.
 */
export interface PublicVariantReadModel {
  /** Public identifier (UUID v7). */
  publicId: string;
  name: string;
  /** Tax-inclusive sale price. */
  priceIncludingTax: number;
  coverImage: import("./product-image.read-model.js").ProductImageReadModel | null;
  images: import("./product-image.read-model.js").ProductImageReadModel[];
  /** True when the variant can be bought right now. */
  isAvailable: boolean;
  optionValues: PublicVariantOptionValueReadModel[];
}

/** Product row of the public catalog listing. */
export interface PublicProductListItemReadModel {
  /** Public identifier (UUID v7). */
  publicId: string;
  name: string;
  description: string;
  coverImage: import("./product-image.read-model.js").ProductImageReadModel | null;
  categoryName: string;
  categoryPublicId: string;
  brandName: string;
  brandPublicId: string;
  /** Lowest net (pre-tax) price across active variants; null without variants. */
  minPrice: number | null;
  /** Number of active, non-deleted variants. */
  variantCount: number;
  /** Creation timestamp (ISO 8601, UTC). */
  createdAt: string;
}

/** Full product detail for public (customer-facing) endpoints. */
export interface PublicProductDetailReadModel {
  /** Public identifier (UUID v7). */
  publicId: string;
  name: string;
  description: string;
  coverImage: import("./product-image.read-model.js").ProductImageReadModel | null;
  isActive: boolean;
  /** Creation timestamp (ISO 8601, UTC). */
  createdAt: string;
  category: {
    publicId: string;
    name: string;
  };
  brand: {
    publicId: string;
    name: string;
  };
  options: PublicOptionReadModel[];
  variants: PublicVariantReadModel[];
}

import type { PublicOptionReadModel } from "./public-catalog.read-model.js";
import type { ProductImageReadModel } from "./product-image.read-model.js";
import type { VariantAdminReadModel } from "./variant-admin.read-model.js";

/** Product as exposed by admin detail endpoints (basic data). */
export interface AdminProductReadModel {
  /** Public identifier (UUID v7). */
  publicId: string;
  /** Internal category identifier. */
  categoryId: number;
  categoryPublicId: string;
  categoryName: string;
  /** Internal brand identifier. */
  brandId: number;
  brandPublicId: string;
  brandName: string;
  name: string;
  description: string;
  coverImage: ProductImageReadModel | null;
  isActive: boolean;
  isDeleted: boolean;
  /** Creation timestamp (ISO 8601, UTC). */
  createdAt: string;
}

/** Product row of the admin listing, enriched with variant aggregates. */
export interface AdminProductListItemReadModel extends AdminProductReadModel {
  /** Number of active, non-deleted variants. */
  activeVariantCount: number;
  /** Lowest net price across active variants; null without active variants. */
  minPrice: number | null;
  /** Highest net price across active variants; null without active variants. */
  maxPrice: number | null;
}

/** Full product data for the admin detail endpoint, including collections. */
export interface FullAdminProductReadModel extends AdminProductReadModel {
  variants: VariantAdminReadModel[];
  options: PublicOptionReadModel[];
}

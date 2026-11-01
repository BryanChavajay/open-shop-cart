import type { CreateCategory } from "./create-category.js";
import type { UpdateCategory } from "./update-category.js";
import type { DeleteCategory } from "./delete-category.js";
import type { ListCategories } from "./list-categories.js";
import type { GetCategory } from "./get-category.js";
import type { CreateBrand } from "./create-brand.js";
import type { UpdateBrand } from "./update-brand.js";
import type { DeleteBrand } from "./delete-brand.js";
import type { ListBrands } from "./list-brands.js";
import type { GetBrand } from "./get-brand.js";
import type { CreateProduct } from "./create-product.js";
import type { UpdateProduct } from "./update-product.js";
import type { ActivateProduct } from "./activate-product.js";
import type { DeactivateProduct } from "./deactivate-product.js";
import type { DeleteProduct } from "./delete-product.js";
import type { GetProduct } from "./get-product.js";
import type { ListProductsAdmin } from "./list-products-admin.js";
import type { ReplaceProductOptions } from "./replace-product-options.js";
import type { AddVariant } from "./add-variant.js";
import type { UpdateVariant } from "./update-variant.js";
import type { DeleteVariant } from "./delete-variant.js";
import type { UploadProductImages } from "./upload-product-images.js";
import type { UpdateProductImage } from "./update-product-image.js";
import type { DeleteProductImage } from "./delete-product-image.js";
import type { AssignProductCover, AssignVariantCover, SetVariantCarousel } from "./assign-image.js";
import type { ServeImage } from "./serve-image.js";
import type { ListPublicCatalog } from "./list-public-catalog.js";
import type { GetPublicProduct } from "./get-public-product.js";

export type { CatalogActor } from "./shared/dependencies.js";
export type { UnitOfWork } from "./shared/unit-of-work.js";
export { auditEntryForCatalog } from "./shared/audit.js";
export { toDecimalString } from "./shared/money.js";

export interface CategoryUseCases {
  create: CreateCategory;
  update: UpdateCategory;
  delete: DeleteCategory;
  list: ListCategories;
  get: GetCategory;
}

export interface BrandUseCases {
  create: CreateBrand;
  update: UpdateBrand;
  delete: DeleteBrand;
  list: ListBrands;
  get: GetBrand;
}

export interface ProductUseCases {
  create: CreateProduct;
  update: UpdateProduct;
  activate: ActivateProduct;
  deactivate: DeactivateProduct;
  delete: DeleteProduct;
  get: GetProduct;
  listAdmin: ListProductsAdmin;
  replaceOptions: ReplaceProductOptions;
}

export interface VariantUseCases {
  add: AddVariant;
  update: UpdateVariant;
  delete: DeleteVariant;
}

export interface ImageUseCases {
  upload: UploadProductImages;
  update: UpdateProductImage;
  delete: DeleteProductImage;
  assignProductCover: AssignProductCover;
  assignVariantCover: AssignVariantCover;
  setVariantCarousel: SetVariantCarousel;
  /** Reads the stored binary; public consumers only receive images of active products. */
  serve: ServeImage;
}

export interface PublicCatalogUseCases {
  list: ListPublicCatalog;
  get: GetPublicProduct;
}

/** Plain grouped bag of catalog use cases (instanced by main wiring, stage 5). */
export interface CatalogUseCases {
  categories: CategoryUseCases;
  brands: BrandUseCases;
  products: ProductUseCases;
  variants: VariantUseCases;
  images: ImageUseCases;
  public: PublicCatalogUseCases;
}

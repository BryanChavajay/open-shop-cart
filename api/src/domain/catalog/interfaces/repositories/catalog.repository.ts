import type { Category } from "../../entities/category.entity.js";
import type { Brand } from "../../entities/brand.entity.js";
import { Product } from "../../entities/product.entity.js";
import type { ProductSnapshot } from "../../entities/product.entity.js";
import { Variant } from "../../entities/product-variant.entity.js";
import type { VariantSnapshot } from "../../entities/product-variant.entity.js";
import { Image } from "../../entities/image.entity.js";
import type { ImageSnapshot } from "../../entities/image.entity.js";
import type { ProductOptionSnapshot } from "../../entities/product-option.entity.js";
import type { AdminProductReadModel, AdminProductListItemReadModel } from "../../readmodels/product-admin.read-model.js";
import type { BrandReadModel } from "../../readmodels/brand.read-model.js";
import type { CategoryReadModel } from "../../readmodels/category.read-model.js";
import { CatalogSort } from "../../enums/catalog-sort.enum.js";
import type { PublicProductListItemReadModel } from "../../readmodels/public-catalog.read-model.js";
import type { CommandExecutor } from "../../../shared/interfaces/providers/sql-executor.js";
import type { PaginatedReadModel } from "../../../shared/readmodels/paginated.read-model.js";

export type ProductState = ProductSnapshot;
export type VariantState = VariantSnapshot;
export interface AdminProductFilter { categoryId?: number; brandId?: number; includeDeleted: boolean; page: number; pageSize: number; }
export interface PublicCatalogFilter { searchText?: string; categoryId?: string; brandId?: string; minPrice?: number; maxPrice?: number; onlyAvailable: boolean; sort: CatalogSort; page: number; pageSize: number; }
export interface VariantComboValue { valueId: number; valuePublicId: string; value: string; }
export interface NewProductOptionData { publicId: string; name: string; sortOrder: number; }
export interface NewProductOptionValueData { publicId: string; value: string; sortOrder: number; }
export interface VariantCarouselImage { image: ImageSnapshot; sortOrder: number; }

export interface CatalogWriteRepository {
  lockProduct(executor: CommandExecutor, productId: number): Promise<void>;
  saveCategory(executor: CommandExecutor, category: Category): Promise<void>;
  softDeleteCategory(executor: CommandExecutor, categoryInternalId: number): Promise<void>;
  saveBrand(executor: CommandExecutor, brand: Brand): Promise<void>;
  softDeleteBrand(executor: CommandExecutor, brandInternalId: number): Promise<void>;
  saveProduct(executor: CommandExecutor, product: Product): Promise<number>;
  softDeleteProduct(executor: CommandExecutor, productInternalId: number): Promise<void>;
  softDeleteVariant(executor: CommandExecutor, variantInternalId: number): Promise<void>;
  saveVariant(executor: CommandExecutor, variant: Variant, productId: number): Promise<number>;
  saveOption(executor: CommandExecutor, productInternalId: number, option: NewProductOptionData): Promise<number>;
  saveOptionValue(executor: CommandExecutor, optionInternalId: number, value: NewProductOptionValueData): Promise<number>;
  replaceOptionsOfProduct(executor: CommandExecutor, productInternalId: number): Promise<void>;
  clearCombo(executor: CommandExecutor, variantInternalId: number): Promise<void>;
  addComboValue(executor: CommandExecutor, variantInternalId: number, valueInternalId: number): Promise<void>;
  saveImage(executor: CommandExecutor, image: Image): Promise<void>;
  updateImage(executor: CommandExecutor, image: Image): Promise<void>;
  deleteImagePhysically(executor: CommandExecutor, imagePublicId: string): Promise<ImageSnapshot | null>;
  setProductCover(executor: CommandExecutor, productId: number, imageId: number | null): Promise<void>;
  setVariantCover(executor: CommandExecutor, variantId: number, imageId: number | null): Promise<void>;
  setVariantCarousel(executor: CommandExecutor, variantId: number, imageIds: number[]): Promise<void>;
}

export interface CatalogReadRepository {
  withExecutor(executor: CommandExecutor): CatalogReadRepository;
  listCategories(includeDeleted: boolean, page: number, pageSize: number): Promise<PaginatedReadModel<CategoryReadModel>>;
  findCategoryByPublicId(publicId: string): Promise<CategoryReadModel | null>;
  findCategoryProducts(executor: CommandExecutor, categoryInternalId: number): Promise<string[]>;
  listBrands(includeDeleted: boolean, page: number, pageSize: number): Promise<PaginatedReadModel<BrandReadModel>>;
  findBrandByPublicId(publicId: string): Promise<BrandReadModel | null>;
  findBrandProducts(executor: CommandExecutor, brandInternalId: number): Promise<string[]>;
  findProductStateByPublicId(publicId: string): Promise<ProductState | null>;
  findProductStateByInternalId(productInternalId: number): Promise<ProductState | null>;
  findProductDetailByPublicId(publicId: string): Promise<AdminProductReadModel | null>;
  listProductsAdmin(filters: AdminProductFilter): Promise<PaginatedReadModel<AdminProductListItemReadModel>>;
  listPublicProducts(filters: PublicCatalogFilter): Promise<PaginatedReadModel<PublicProductListItemReadModel>>;
  findVariantByPublicId(publicId: string): Promise<VariantState | null>;
  listVariantsOfProduct(productInternalId: number): Promise<VariantState[]>;
  listComboValues(variantInternalId: number): Promise<VariantComboValue[]>;
  listOptionsOfProduct(productInternalId: number): Promise<ProductOptionSnapshot[]>;
  findImageByStorageKey(storageKey: string): Promise<ImageSnapshot | null>;
  findImageByPublicId(publicId: string): Promise<ImageSnapshot | null>;
  findImageByInternalId(id: number): Promise<ImageSnapshot | null>;
  listVariantCarousel(variantId: number): Promise<VariantCarouselImage[]>;
  hasImageReferences(imageId: number): Promise<boolean>;
  canServeImagePublicly(imageId: number): Promise<boolean>;
}

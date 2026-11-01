import type {
  AdminProductFilter,
  CatalogReadRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { assertValidPagination } from "./shared/pagination.js";

export interface ListProductsAdminQuery {
  /** Public identifier of the category filter; omitted for "all categories". */
  categoryId?: string | undefined;
  /** Public identifier of the brand filter; omitted for "all brands". */
  brandId?: string | undefined;
  /** With true the listing shows deleted products instead of active ones. */
  includeDeleted: boolean;
  /** Pages start at 1. */
  page: number;
  pageSize: number;
}

/**
 * Paginated admin product listing. Public category/brand filters are resolved
 * to internal identifiers; an unknown filter reports NotFoundError. (The
 * underlying procedure filters by exact `Eliminado`, so includeDeleted toggles
 * between the deleted page and the active page.)
 */
export class ListProductsAdmin {
  constructor(private readonly reads: CatalogReadRepository) {}

  async execute(query: ListProductsAdminQuery) {
    assertValidPagination(query.page, query.pageSize);

    let categoryId: number | undefined;
    if (query.categoryId !== undefined) {
      const category = await this.reads.findCategoryByPublicId(query.categoryId);
      if (category === null) {
        throw new NotFoundError(
          "Category not found",
          undefined,
          undefined,
          undefined,
        );
      }
      categoryId = category.id;
    }

    let brandId: number | undefined;
    if (query.brandId !== undefined) {
      const brand = await this.reads.findBrandByPublicId(query.brandId);
      if (brand === null) {
        throw new NotFoundError(
          "Brand not found",
          undefined,
          undefined,
          undefined,
        );
      }
      brandId = brand.id;
    }

    // Under exactOptionalPropertyTypes, filters are set only when present.
    const filters: AdminProductFilter = {
      includeDeleted: query.includeDeleted,
      page: query.page,
      pageSize: query.pageSize,
    };
    if (categoryId !== undefined) {
      filters.categoryId = categoryId;
    }
    if (brandId !== undefined) {
      filters.brandId = brandId;
    }
    return this.reads.listProductsAdmin(filters);
  }
}

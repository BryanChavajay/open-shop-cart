import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import { assertValidPagination } from "./shared/pagination.js";

export interface ListCategoriesQuery {
  includeDeleted: boolean;
  /** Pages start at 1. */
  page: number;
  pageSize: number;
}

/** Paginated admin listing of categories (pure read, no transaction). */
export class ListCategories {
  constructor(private readonly reads: CatalogReadRepository) {}

  async execute(query: ListCategoriesQuery) {
    assertValidPagination(query.page, query.pageSize);
    return this.reads.listCategories(
      query.includeDeleted,
      query.page,
      query.pageSize,
    );
  }
}

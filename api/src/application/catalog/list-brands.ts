import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import { assertValidPagination } from "./shared/pagination.js";

export interface ListBrandsQuery {
  includeDeleted: boolean;
  /** Pages start at 1. */
  page: number;
  pageSize: number;
}

/** Paginated admin listing of brands (pure read, no transaction). */
export class ListBrands {
  constructor(private readonly reads: CatalogReadRepository) {}

  async execute(query: ListBrandsQuery) {
    assertValidPagination(query.page, query.pageSize);
    return this.reads.listBrands(query.includeDeleted, query.page, query.pageSize);
  }
}

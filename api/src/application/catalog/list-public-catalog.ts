import type {
  CatalogReadRepository,
  PublicCatalogFilter,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { CatalogSort } from "../../domain/catalog/enums/catalog-sort.enum.js";
import type { TaxCalculator } from "../../domain/shared/interfaces/providers/tax-calculator.js";
import { toDecimalString } from "./shared/money.js";
import { assertValidPagination } from "./shared/pagination.js";

export interface ListPublicCatalogQuery {
  searchText?: string;
  /** Public identifier of the category filter; omitted for "all categories". */
  categoryId?: string;
  /** Public identifier of the brand filter; omitted for "all brands". */
  brandId?: string;
  /**
   * PUBLISHED (tax-inclusive) price bounds. They are converted to net amounts
   * with the TaxCalculator before reaching persistence, which filters on net
   * variant prices.
   */
  minPrice?: number;
  /** See `minPrice`. */
  maxPrice?: number;
  onlyAvailable: boolean;
  sort: CatalogSort;
  /** Pages start at 1. */
  page: number;
  pageSize: number;
}

/** Paginated public catalog listing (active products only; no transaction). */
export class ListPublicCatalog {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly taxCalculator: TaxCalculator,
  ) {}

  async execute(query: ListPublicCatalogQuery) {
    assertValidPagination(query.page, query.pageSize);

    // Under exactOptionalPropertyTypes the optional bounds carry only real
    // values; gross -> net conversion happens here (persistence filters net
    // variant prices).
    const filter: PublicCatalogFilter = {
      onlyAvailable: query.onlyAvailable,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.searchText !== undefined) {
      filter.searchText = query.searchText;
    }
    if (query.categoryId !== undefined) {
      filter.categoryId = query.categoryId;
    }
    if (query.brandId !== undefined) {
      filter.brandId = query.brandId;
    }
    if (query.minPrice !== undefined) {
      filter.minPrice = Number(
        this.taxCalculator.removeTax(toDecimalString(query.minPrice)),
      );
    }
    if (query.maxPrice !== undefined) {
      filter.maxPrice = Number(
        this.taxCalculator.removeTax(toDecimalString(query.maxPrice)),
      );
    }
    return this.reads.listPublicProducts(filter);
  }
}

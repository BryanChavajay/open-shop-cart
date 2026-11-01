import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";

export interface GetCategoryQuery {
  publicId: string;
}

/** Admin category detail. Deleted categories are not addressable. */
export class GetCategory {
  constructor(private readonly reads: CatalogReadRepository) {}

  async execute(query: GetCategoryQuery) {
    const row = await this.reads.findCategoryByPublicId(query.publicId);
    if (row === null || row.isDeleted) {
      throw new NotFoundError(
        "Category not found",
        undefined,
        undefined,
        undefined,
      );
    }
    return row;
  }
}

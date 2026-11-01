import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";

export interface GetBrandQuery {
  publicId: string;
}

/** Admin brand detail. Deleted brands are not addressable. */
export class GetBrand {
  constructor(private readonly reads: CatalogReadRepository) {}

  async execute(query: GetBrandQuery) {
    const row = await this.reads.findBrandByPublicId(query.publicId);
    if (row === null || row.isDeleted) {
      throw new NotFoundError(
        "Brand not found",
        undefined,
        undefined,
        undefined,
      );
    }
    return row;
  }
}

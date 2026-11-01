import type { CatalogReadRepository } from "../../../domain/catalog/interfaces/repositories/catalog.repository.js";
import { NotFoundError } from "../../../domain/shared/errors/not-found.js";

/** Resolves a non-deleted variant and its parent, including nested route ownership. */
export async function findVariantWithProduct(
  reads: CatalogReadRepository,
  variantPublicId: string,
  productPublicId?: string,
) {
  const variant = await reads.findVariantByPublicId(variantPublicId);
  if (variant === null || variant.isDeleted) {
    throw new NotFoundError("Variant not found", undefined, undefined, undefined);
  }
  const product = await reads.findProductStateByInternalId(variant.productId);
  if (product === null || product.isDeleted ||
      (productPublicId !== undefined && product.publicId !== productPublicId)) {
    throw new NotFoundError("Product or variant not found", undefined, undefined, undefined);
  }
  return { variant, product };
}

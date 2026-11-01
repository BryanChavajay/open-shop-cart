import type { CatalogReadRepository } from "../../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { ImageSnapshot } from "../../../domain/catalog/entities/image.entity.js";
import type { ProductOptionSnapshot } from "../../../domain/catalog/entities/product-option.entity.js";
import type { VariantSnapshot } from "../../../domain/catalog/entities/product-variant.entity.js";
import type { FullAdminProductReadModel } from "../../../domain/catalog/readmodels/product-admin.read-model.js";
import type { ProductImageReadModel } from "../../../domain/catalog/readmodels/product-image.read-model.js";
import type { PublicProductDetailReadModel, PublicOptionReadModel } from "../../../domain/catalog/readmodels/public-catalog.read-model.js";
import type { TaxCalculator } from "../../../domain/shared/interfaces/providers/tax-calculator.js";
import { toDecimalString } from "./money.js";
import { requireInternalId } from "./entity-ids.js";

function toImage(image: ImageSnapshot | null, isAdmin = false): ProductImageReadModel | null {
  return image === null ? null : {
    publicId: image.publicId, url: `/api/v1/${isAdmin ? "images" : "catalog/images"}/${image.publicId}`,
    storageKey: image.storageKey, contentType: image.contentType,
    sizeBytes: image.sizeBytes, width: image.width, height: image.height, altText: image.altText,
  };
}
function toOptions(options: ProductOptionSnapshot[]): PublicOptionReadModel[] {
  return options.map((option) => ({ publicId: option.publicId, name: option.name,
    values: option.values.map((value) => ({ publicId: value.publicId, value: value.value })) }));
}
async function coverAndGallery(reads: CatalogReadRepository, id: number, coverId: number | null, isAdmin = false) {
  const cover = coverId ? await reads.findImageByInternalId(coverId) : null;
  const carousel = await reads.listVariantCarousel(id);
  return {
    coverImage: toImage(cover, isAdmin),
    // The viewer receives cover first, exactly once, then the ordered gallery.
    images: [...(cover === null ? [] : [cover]), ...carousel.filter((item) => item.image.id !== coverId).map((item) => item.image)]
      .map((item) => toImage(item, isAdmin)!),
  };
}
function combo(values: { valuePublicId: string; value: string }[], options: ProductOptionSnapshot[]) {
  const byId = new Map(options.flatMap((option) => option.values.map((value) => [value.publicId, { optionPublicId: option.publicId }])));
  const order = new Map(options.map((option, index) => [option.publicId, index]));
  return values.map((value) => {
    const option = byId.get(value.valuePublicId);
    if (option === undefined) throw new Error("A variant combination references an unknown option value");
    return { publicId: value.valuePublicId, value: value.value, optionPublicId: option.optionPublicId };
  }).toSorted((left, right) => (order.get(left.optionPublicId) ?? 0) - (order.get(right.optionPublicId) ?? 0));
}
async function adminVariant(reads: CatalogReadRepository, variant: VariantSnapshot, optionList: ProductOptionSnapshot[], tax: TaxCalculator) {
  const media = await coverAndGallery(reads, requireInternalId(variant.id), variant.coverImageId, true);
  return { ...media, publicId: variant.publicId, productId: variant.productId, sku: variant.sku,
    name: variant.name, unitCost: variant.unitCost, unitPrice: variant.unitPrice,
    priceIncludingTax: Number(tax.addTax(toDecimalString(variant.unitPrice))), sortOrder: variant.sortOrder,
    isActive: variant.isActive, isDeleted: variant.isDeleted,
    optionValues: combo(await reads.listComboValues(requireInternalId(variant.id)), optionList) };
}
export async function assembleFullProduct(reads: CatalogReadRepository, tax: TaxCalculator, publicId: string): Promise<FullAdminProductReadModel | null> {
  const state = await reads.findProductStateByPublicId(publicId);
  const detail = await reads.findProductDetailByPublicId(publicId);
  if (state === null || detail === null || state.isDeleted || detail.isDeleted) return null;
  const productId = requireInternalId(state.id);
  const optionList = await reads.listOptionsOfProduct(productId);
  const variants = await reads.listVariantsOfProduct(productId);
  const adminVariants = [];
  for (const variant of variants) adminVariants.push(await adminVariant(reads, variant, optionList, tax));
  return { ...detail, coverImage: toImage(state.coverImageId ? await reads.findImageByInternalId(state.coverImageId) : null, true),
    variants: adminVariants, options: toOptions(optionList) };
}
export async function assemblePublicProduct(reads: CatalogReadRepository, tax: TaxCalculator, publicId: string): Promise<PublicProductDetailReadModel | null> {
  const state = await reads.findProductStateByPublicId(publicId);
  const detail = await reads.findProductDetailByPublicId(publicId);
  if (state === null || detail === null || state.isDeleted || !state.isActive) return null;
  const productId = requireInternalId(state.id);
  const optionList = await reads.listOptionsOfProduct(productId);
  const variants = (await reads.listVariantsOfProduct(productId)).filter((variant) => variant.isActive);
  const publicVariants = [];
  for (const variant of variants) {
    const media = await coverAndGallery(reads, requireInternalId(variant.id), variant.coverImageId);
    publicVariants.push({ ...media, publicId: variant.publicId, name: variant.name,
      priceIncludingTax: Number(tax.addTax(toDecimalString(variant.unitPrice))),
      isAvailable: variant.existenciaFisica > 0,
      optionValues: combo(await reads.listComboValues(requireInternalId(variant.id)), optionList) });
  }
  return { publicId: detail.publicId, name: detail.name, description: detail.description,
    coverImage: toImage(state.coverImageId ? await reads.findImageByInternalId(state.coverImageId) : null),
    isActive: detail.isActive, createdAt: detail.createdAt,
    category: { publicId: detail.categoryPublicId, name: detail.categoryName },
    brand: { publicId: detail.brandPublicId, name: detail.brandName },
    options: toOptions(optionList), variants: publicVariants };
}

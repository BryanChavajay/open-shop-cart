import { z } from "zod";
import { paginatedSchema } from "../shared/paginated.schema.js";

export const createdCatalogEntitySchema = z.object({ publicId: z.uuid() });

export const taxonomySchema = z.object({
  id: z.number().int(),
  publicId: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  isDeleted: z.boolean(),
  productCount: z.number().int().nullable().optional(),
});
export const paginatedTaxonomySchema = paginatedSchema(taxonomySchema);

const optionValueSchema = z.object({ publicId: z.uuid(), value: z.string() });
const optionSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  values: z.array(optionValueSchema),
});
const variantOptionValueSchema = optionValueSchema.extend({ optionPublicId: z.uuid() });
export const imageSchema = z.object({
  publicId: z.uuid(),
  url: z.string(),
  storageKey: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  width: z.number(),
  height: z.number(),
  altText: z.string().nullable(),
});
const publicImageSchema = imageSchema.omit({ storageKey: true });
const publicVariantSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  priceIncludingTax: z.number(),
  isAvailable: z.boolean(),
  optionValues: z.array(variantOptionValueSchema),
  coverImage: publicImageSchema.nullable(),
  images: z.array(publicImageSchema),
});
const adminVariantSchema = z.object({
  publicId: z.uuid(),
  productId: z.number(),
  sku: z.string(),
  name: z.string(),
  unitCost: z.number().nullable(),
  unitPrice: z.number(),
  priceIncludingTax: z.number(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  isDeleted: z.boolean(),
  optionValues: z.array(variantOptionValueSchema),
  coverImage: imageSchema.nullable(),
  images: z.array(imageSchema),
});
const adminProductSchema = z.object({
  publicId: z.uuid(),
  categoryId: z.number(),
  categoryPublicId: z.uuid(),
  categoryName: z.string(),
  brandId: z.number(),
  brandPublicId: z.uuid(),
  brandName: z.string(),
  name: z.string(),
  description: z.string(),
  coverImage: imageSchema.nullable(),
  isActive: z.boolean(),
  isDeleted: z.boolean(),
  createdAt: z.string(),
});
export const fullAdminProductSchema = adminProductSchema.extend({
  variants: z.array(adminVariantSchema),
  options: z.array(optionSchema),
});
export const paginatedAdminProductsSchema = paginatedSchema(adminProductSchema.extend({
  activeVariantCount: z.number(),
  minPrice: z.number().nullable(),
  maxPrice: z.number().nullable(),
}));

export const publicProductDetailSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  description: z.string(),
  coverImage: publicImageSchema.nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  category: z.object({ publicId: z.uuid(), name: z.string() }),
  brand: z.object({ publicId: z.uuid(), name: z.string() }),
  options: z.array(optionSchema),
  variants: z.array(publicVariantSchema),
});
export const paginatedPublicProductsSchema = paginatedSchema(z.object({
  publicId: z.uuid(),
  name: z.string(),
  description: z.string(),
  coverImage: publicImageSchema.nullable(),
  categoryName: z.string(),
  categoryPublicId: z.uuid(),
  brandName: z.string(),
  brandPublicId: z.uuid(),
  minPrice: z.number().nullable(),
  variantCount: z.number(),
  createdAt: z.string(),
}));

export const uploadedImagesSchema = z.array(createdCatalogEntitySchema);

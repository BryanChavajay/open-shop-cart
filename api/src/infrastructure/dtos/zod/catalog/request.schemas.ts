import { z } from "zod";
import { CatalogSort } from "../../../../domain/catalog/enums/catalog-sort.enum.js";
import type { ListPublicCatalogQuery } from "../../../../application/catalog/list-public-catalog.js";

// --- shared field shapes ---

const positiveInteger = z.coerce.number().int().positive();

const pageQuery = positiveInteger.optional().default(1);

const pageSizeQuery = positiveInteger.pipe(z.number().max(100)).optional().default(20);

/** Boolean flag received as a query string ("true"/"false"). */
const booleanFromQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const taxonomyName = z.string().trim().min(1).max(100);

/** Monetary cap (in units) for any amount accepted by the API. */
const MONEY_MAX = 99_999_999;

const moneyMessage = "El monto debe tener hasta dos decimales";

const positiveMoney = z
  .number()
  .positive()
  .max(MONEY_MAX)
  .refine(hasAtMostTwoDecimals, moneyMessage);

const unitCostMoney = z
  .number()
  .min(0)
  .max(MONEY_MAX)
  .refine(hasAtMostTwoDecimals, moneyMessage)
  .nullable()
  .optional();

const priceQuery = z.coerce
  .number()
  .positive()
  .max(MONEY_MAX)
  .refine(hasAtMostTwoDecimals, moneyMessage);

function hasAtMostTwoDecimals(value: number): boolean {
  const fraction = String(value).split(".")[1] ?? "";
  return fraction.length <= 2;
}

const optionValue = z.strictObject({
  value: z.string().trim().min(1).max(50),
  sortOrder: positiveInteger.optional(),
});

const productOption = z.strictObject({
  name: z.string().trim().min(1).max(50),
  values: z.array(optionValue).min(1),
});

/**
 * Reference of a variant's option value against an EXISTING product
 * (add/update-variant): options already have public ids.
 */
const comboValueRef = z.strictObject({
  optionPublicId: z.uuid(),
  valuePublicId: z.uuid(),
});

/**
 * Positional reference for create-product: the options in the command are
 * brand new and their public ids are assigned by the use case, so variants
 * select values by their 1-based position (option then value).
 */
const createComboValueRef = z.strictObject({
  optionIndex: positiveInteger,
  valueIndex: positiveInteger,
});

const createVariant = z.strictObject({
  name: z.string().trim().min(1).max(100),
  unitCost: unitCostMoney,
  unitPrice: positiveMoney,
  sortOrder: positiveInteger.optional(),
  optionValues: z.array(createComboValueRef),
});

// --- params ---

export const publicIdParamsSchema = z.strictObject({ publicId: z.uuid() });

export const productVariantParamsSchema = z.strictObject({
  publicId: z.uuid(),
  variantPublicId: z.uuid(),
});

export const productImageParamsSchema = z.strictObject({
  publicId: z.uuid(),
  imagePublicId: z.uuid(),
});

export const imageParamsSchema = z.strictObject({ imagePublicId: z.uuid() });

// --- public catalog ---

/**
 * Public catalog listing query (`?q=` is the search text). Prices travel in
 * monetary units with up to 2 decimals; the use case converts the gross
 * bounds to net with the TaxCalculator.
 */
export const publicCatalogQuerySchema = z
  .strictObject({
    q: z.string().trim().min(1).max(200).optional(),
    categoryId: z.uuid().optional(),
    brandId: z.uuid().optional(),
    minPrice: priceQuery.optional(),
    maxPrice: priceQuery.optional(),
    onlyAvailable: booleanFromQuery.optional().default(false),
    sort: z.enum(CatalogSort).optional().default(CatalogSort.NEWEST),
    page: pageQuery,
    pageSize: pageSizeQuery,
  })
  .transform(
    ({
      q,
      categoryId,
      brandId,
      minPrice,
      maxPrice,
      onlyAvailable,
      sort,
      page,
      pageSize,
    }): ListPublicCatalogQuery => ({
      onlyAvailable,
      sort,
      page,
      pageSize,
      ...(q !== undefined ? { searchText: q } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(brandId !== undefined ? { brandId } : {}),
      ...(minPrice !== undefined ? { minPrice } : {}),
      ...(maxPrice !== undefined ? { maxPrice } : {}),
    }),
  );

// --- categories ---

export const createCategorySchema = z.strictObject({
  name: taxonomyName,
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z
  .strictObject({
    name: taxonomyName.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.isActive !== undefined,
    "Debe proporcionar al menos un campo",
  );

// --- brands ---

export const createBrandSchema = z.strictObject({
  name: taxonomyName,
  isActive: z.boolean().default(true),
});

export const updateBrandSchema = z
  .strictObject({
    name: taxonomyName.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.isActive !== undefined,
    "Debe proporcionar al menos un campo",
  );

// --- taxonomy lists (categories and brands) ---

export const listTaxonomyQuerySchema = z.strictObject({
  includeDeleted: booleanFromQuery.optional().default(false),
  page: pageQuery,
  pageSize: pageSizeQuery,
});

// --- products ---

export const listProductsAdminQuerySchema = z.strictObject({
  includeDeleted: booleanFromQuery.optional().default(false),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  page: pageQuery,
  pageSize: pageSizeQuery,
});

export const createProductSchema = z.strictObject({
  categoryId: z.uuid(),
  brandId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  options: z.array(productOption),
  variants: z.array(createVariant).min(1).max(30),
});

export const updateProductSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    // Public ids of the target category/brand ("*PublicId" in the command).
    categoryId: z.uuid().optional(),
    brandId: z.uuid().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.categoryId !== undefined ||
      value.brandId !== undefined,
    "Debe proporcionar al menos un campo",
  );

/** Activation is an explicit action (activate/deactivate use cases). */
export const setProductActiveSchema = z.strictObject({ isActive: z.boolean() });

export const replaceProductOptionsSchema = z.strictObject({
  // Full new option set; empty clears every option of the product.
  options: z.array(productOption),
});

// --- variants ---

export const addVariantSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  unitCost: unitCostMoney,
  unitPrice: positiveMoney,
  sortOrder: positiveInteger.optional(),
  isActive: z.boolean().optional(),
  imagePublicId: z.uuid().optional(),
  optionValues: z.array(comboValueRef),
});

export const updateVariantSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    unitCost: unitCostMoney,
    unitPrice: positiveMoney.optional(),
    sortOrder: positiveInteger.optional(),
    isActive: z.boolean().optional(),
    optionValues: z.array(comboValueRef).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.unitCost !== undefined ||
      value.unitPrice !== undefined ||
      value.sortOrder !== undefined ||
      value.isActive !== undefined ||
      value.optionValues !== undefined,
    "Debe proporcionar al menos un campo",
  );

// --- product images ---

/**
 * Multipart upload body: `altTexts` is a plain JSON string
 * `[string | null, ...]` aligned with the uploaded files' order.
 */
const altTextsField = z
  .string()
  .optional()
  .transform((raw, ctx): (string | null)[] => {
    if (raw === undefined || raw === "") return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: "custom", message: "altTexts debe ser un array JSON de string|null" });
      return z.NEVER;
    }
    const result = z
      .array(z.union([z.string().min(1).max(300), z.null()]))
      .safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({
        code: "custom",
        message: "altTexts debe ser un array JSON de string|null",
      });
      return z.NEVER;
    }
    return result.data;
  });

export const uploadProductImagesBodySchema = z.object({
  altTexts: altTextsField,
});

export const updateProductImageSchema = z.strictObject({
  altText: z.string().trim().max(300).nullable(),
});

export const assignImageSchema = z.strictObject({
  imagePublicId: z.uuid().nullable(),
});

export const setCarouselSchema = z.strictObject({
  imagePublicIds: z.array(z.uuid()).refine((ids) => new Set(ids).size === ids.length, "Una imagen no puede repetirse en el carrusel"),
});

export type PublicCatalogQueryRequest = z.infer<typeof publicCatalogQuerySchema>;

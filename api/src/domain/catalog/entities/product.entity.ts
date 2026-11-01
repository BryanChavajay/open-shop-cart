import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Maximum accepted length for a product name and description. */
const NAME_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;

/** Complete state of a product, used to restore the entity from persistence. */
export interface ProductSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Internal identifier of the owning category. */
  categoryId: number;
  /** Internal identifier of the owning brand. */
  brandId: number;
  name: string;
  description: string;
  coverImageId: number | null;
  isActive: boolean;
  isDeleted: boolean;
  /** Creation timestamp (ISO 8601, UTC). */
  createdAt?: string;
  /** Last update timestamp (ISO 8601, UTC). */
  updatedAt?: string;
}

/** Data required to create a new product. */
export interface NewProductData {
  publicId: string;
  categoryId: number;
  brandId: number;
  name: string;
  description: string;
  /** Activation prerequisites are enforced by the use case, not here. */
  isActive: boolean;
}

/** Data that can be changed on an existing product. */
export interface UpdateProductData {
  categoryId?: number;
  brandId?: number;
  name?: string;
  description?: string;
}

/**
 * Catalog product entity with its basic data only. Variants, options and
 * images are handled by repositories/read models. Every modification goes
 * through methods that enforce business rules.
 */
export class Product {
  private state: ProductSnapshot;

  private constructor(state: ProductSnapshot) {
    this.state = state;
  }

  /** Creates a new product (not persisted yet). */
  static create(data: NewProductData): Product {
    return new Product({
      id: null,
      publicId: data.publicId,
      categoryId: Product.requireCategoryId(data.categoryId),
      brandId: Product.requireBrandId(data.brandId),
      name: Product.requireName(data.name),
      description: Product.requireDescription(data.description),
      isActive: data.isActive,
      isDeleted: false,
      coverImageId: null,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: ProductSnapshot): Product {
    return new Product({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get categoryId(): number {
    return this.state.categoryId;
  }

  get brandId(): number {
    return this.state.brandId;
  }

  get name(): string {
    return this.state.name;
  }

  get description(): string {
    return this.state.description;
  }

  get isActive(): boolean {
    return this.state.isActive;
  }

  get isDeleted(): boolean {
    return this.state.isDeleted;
  }

  assignCover(imageId: number | null): void {
    this.assertNotDeleted();
    if (imageId !== null && (!Number.isSafeInteger(imageId) || imageId < 1)) {
      throw new BusinessRuleViolation("Invalid cover image identifier", ErrorCode.INVALID_INPUT, "imageId", undefined);
    }
    if (imageId === null && this.state.isActive) {
      throw new BusinessRuleViolation("An active product must have a cover image", ErrorCode.INVALID_CATALOG_ENTITY_STATE, undefined, undefined);
    }
    this.state.coverImageId = imageId;
  }

  /** Replaces the mutable basic data. Only the provided fields change. */
  update(data: UpdateProductData): void {
    this.assertNotDeleted();
    if (data.categoryId !== undefined) {
      this.state.categoryId = Product.requireCategoryId(data.categoryId);
    }
    if (data.brandId !== undefined) {
      this.state.brandId = Product.requireBrandId(data.brandId);
    }
    if (data.name !== undefined) {
      this.state.name = Product.requireName(data.name);
    }
    if (data.description !== undefined) {
      this.state.description = Product.requireDescription(data.description);
    }
  }

  /** Publishes only when the product and all active variants have covers. */
  activate(activeVariantCoverIds: readonly (number | null)[]): void {
    this.assertNotDeleted();
    if (this.state.coverImageId === null || activeVariantCoverIds.length === 0 ||
        activeVariantCoverIds.some((id) => id === null)) {
      throw new BusinessRuleViolation(
        "Publication requires a product cover, at least one active variant and a cover for every active variant",
        ErrorCode.EMPTY_CATALOG_COLLECTION, undefined, undefined,
      );
    }
    this.state.isActive = true;
  }

  /** Deactivates the product without removing it. */
  deactivate(): void {
    this.assertNotDeleted();
    this.state.isActive = false;
  }

  /** Soft delete: marks it as deleted and also deactivates it. */
  markDeleted(): void {
    this.assertNotDeleted();
    this.state.isDeleted = true;
    this.state.isActive = false;
  }

  /** Copy of the current state. */
  toSnapshot(): ProductSnapshot {
    return { ...this.state };
  }

  private assertNotDeleted(): void {
    if (this.state.isDeleted) {
      throw new BusinessRuleViolation(
        "The product was deleted",
        ErrorCode.INVALID_CATALOG_ENTITY_STATE,
        undefined,
        undefined,
      );
    }
  }

  private static requireCategoryId(value: number): number {
    Product.requirePositiveInteger(value, "categoryId");
    return value;
  }

  private static requireBrandId(value: number): number {
    Product.requirePositiveInteger(value, "brandId");
    return value;
  }

  private static requireName(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleViolation(
        "The required field name was not provided",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "name",
        undefined,
      );
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      throw new BusinessRuleViolation(
        `The product name exceeds ${NAME_MAX_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        "name",
        undefined,
      );
    }
    return trimmed;
  }

  private static requireDescription(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleViolation(
        "The required field description was not provided",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "description",
        undefined,
      );
    }
    if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
      throw new BusinessRuleViolation(
        `The product description exceeds ${DESCRIPTION_MAX_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        "description",
        undefined,
      );
    }
    return trimmed;
  }

  private static requirePositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1) {
      throw new BusinessRuleViolation(
        `The field ${field} must be an integer greater than zero`,
        ErrorCode.INVALID_INPUT,
        field,
        undefined,
      );
    }
  }
}

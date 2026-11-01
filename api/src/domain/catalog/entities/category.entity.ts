import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Maximum accepted length for a category name. */
const NAME_MAX_LENGTH = 100;

/** Complete state of a category, used to restore the entity from persistence. */
export interface CategorySnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Unique among active (non-deleted) categories. */
  name: string;
  isActive: boolean;
  isDeleted: boolean;
}

/** Data required to create a new category. */
export interface NewCategoryData {
  publicId: string;
  name: string;
  /** Activation is decided by the use case. */
  isActive: boolean;
}

/**
 * Catalog category entity. Every modification goes through methods that
 * enforce business rules.
 */
export class Category {
  private state: CategorySnapshot;

  private constructor(state: CategorySnapshot) {
    this.state = state;
  }

  /** Creates a new category (not persisted yet). */
  static create(data: NewCategoryData): Category {
    return new Category({
      id: null,
      publicId: data.publicId,
      name: Category.requireName(data.name),
      isActive: data.isActive,
      isDeleted: false,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: CategorySnapshot): Category {
    return new Category({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get name(): string {
    return this.state.name;
  }

  get isActive(): boolean {
    return this.state.isActive;
  }

  get isDeleted(): boolean {
    return this.state.isDeleted;
  }

  /** Renames the category. Uniqueness among active categories is checked at persistence. */
  update(name: string): void {
    this.assertNotDeleted();
    this.state.name = Category.requireName(name);
  }

  /** Activates the category. */
  activate(): void {
    this.assertNotDeleted();
    this.state.isActive = true;
  }

  /** Deactivates the category without removing it. */
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
  toSnapshot(): CategorySnapshot {
    return { ...this.state };
  }

  private assertNotDeleted(): void {
    if (this.state.isDeleted) {
      throw new BusinessRuleViolation(
        "The category was deleted",
        ErrorCode.INVALID_CATALOG_ENTITY_STATE,
        undefined,
        undefined,
      );
    }
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
        `The category name exceeds ${NAME_MAX_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        "name",
        undefined,
      );
    }
    return trimmed;
  }
}

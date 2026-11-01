import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Maximum accepted length for a brand name. */
const NAME_MAX_LENGTH = 100;

/** Complete state of a brand, used to restore the entity from persistence. */
export interface BrandSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Unique among active (non-deleted) brands. */
  name: string;
  isActive: boolean;
  isDeleted: boolean;
}

/** Data required to create a new brand. */
export interface NewBrandData {
  publicId: string;
  name: string;
  /** Activation is decided by the use case. */
  isActive: boolean;
}

/**
 * Catalog brand entity. Every modification goes through methods that
 * enforce business rules.
 */
export class Brand {
  private state: BrandSnapshot;

  private constructor(state: BrandSnapshot) {
    this.state = state;
  }

  /** Creates a new brand (not persisted yet). */
  static create(data: NewBrandData): Brand {
    return new Brand({
      id: null,
      publicId: data.publicId,
      name: Brand.requireName(data.name),
      isActive: data.isActive,
      isDeleted: false,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: BrandSnapshot): Brand {
    return new Brand({ ...snapshot });
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

  /** Renames the brand. Uniqueness among active brands is checked at persistence. */
  update(name: string): void {
    this.assertNotDeleted();
    this.state.name = Brand.requireName(name);
  }

  /** Activates the brand. */
  activate(): void {
    this.assertNotDeleted();
    this.state.isActive = true;
  }

  /** Deactivates the brand without removing it. */
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
  toSnapshot(): BrandSnapshot {
    return { ...this.state };
  }

  private assertNotDeleted(): void {
    if (this.state.isDeleted) {
      throw new BusinessRuleViolation(
        "The brand was deleted",
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
        `The brand name exceeds ${NAME_MAX_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        "name",
        undefined,
      );
    }
    return trimmed;
  }
}

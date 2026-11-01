import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Maximum accepted length for an option name and an option value. */
const NAME_MAX_LENGTH = 50;
const VALUE_MAX_LENGTH = 50;

/** A selectable value inside an option (plain in-memory data). */
export interface ProductOptionValueSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Unique inside the owning option. */
  value: string;
  /** Display order, greater than or equal to one. */
  sortOrder: number;
}

/** Complete state of a product option, used to restore it from persistence. */
export interface ProductOptionSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Unique inside the owning product. */
  name: string;
  /** Values are replaced as a whole; combinations are validated by the use case. */
  values: ProductOptionValueSnapshot[];
}

/**
 * Immutable product option aggregate. The whole option set of a product is
 * replaced atomically by the use case, so this entity exposes no mutations.
 * Duplicate values/combos are validated by the use case, not here.
 */
export class ProductOption {
  private readonly state: ProductOptionSnapshot;

  private constructor(state: ProductOptionSnapshot) {
    this.state = state;
  }

  /** Creates a new option with its values, validating field-level rules. */
  static create(data: ProductOptionSnapshot): ProductOption {
    return new ProductOption(ProductOption.validated(data));
  }

  /** Restores the option from its persisted state, without revalidating. */
  static restore(snapshot: ProductOptionSnapshot): ProductOption {
    return new ProductOption({
      ...snapshot,
      values: snapshot.values.map((value) => ({ ...value })),
    });
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

  /** Readonly copy of the option values. */
  get values(): readonly ProductOptionValueSnapshot[] {
    return this.state.values.map((value) => ({ ...value }));
  }

  /** Snapshot of the current state. */
  toSnapshot(): ProductOptionSnapshot {
    return {
      id: this.state.id,
      publicId: this.state.publicId,
      name: this.state.name,
      values: this.values.map((value) => ({ ...value })),
    };
  }

  private static validated(data: ProductOptionSnapshot): ProductOptionSnapshot {
    return {
      id: data.id,
      publicId: data.publicId,
      name: ProductOption.requireName(data.name),
      values: data.values.map((value) => ({
        id: value.id,
        publicId: value.publicId,
        value: ProductOption.requireValue(value.value),
        sortOrder: ProductOption.requireSortOrder(value.sortOrder),
      })),
    };
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
        `The option name exceeds ${NAME_MAX_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        "name",
        undefined,
      );
    }
    return trimmed;
  }

  private static requireValue(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleViolation(
        "The required field value was not provided",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "value",
        undefined,
      );
    }
    if (trimmed.length > VALUE_MAX_LENGTH) {
      throw new BusinessRuleViolation(
        `The option value exceeds ${VALUE_MAX_LENGTH} characters`,
        ErrorCode.INVALID_INPUT,
        "value",
        undefined,
      );
    }
    return trimmed;
  }

  private static requireSortOrder(value: number): number {
    if (!Number.isInteger(value) || value < 1) {
      throw new BusinessRuleViolation(
        "The field sortOrder must be an integer greater than zero",
        ErrorCode.INVALID_INPUT,
        "sortOrder",
        undefined,
      );
    }
    return value;
  }
}

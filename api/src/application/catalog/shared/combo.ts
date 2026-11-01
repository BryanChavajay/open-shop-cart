import { BusinessRuleViolation } from "../../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../../domain/shared/enums/error-code.enum.js";
import type { ProductOptionSnapshot } from "../../../domain/catalog/entities/product-option.entity.js";

/** Value of an option selected by a variant, as expressed by a command. */
export interface ComboValueRef {
  /** Public identifier of the option. */
  optionPublicId: string;
  /** Public identifier of the selected option value. */
  valuePublicId: string;
}

/** Normalized, order-independent key of a combo of option values. */
export function comboKey(valuePublicIds: readonly string[]): string {
  return [...valuePublicIds].toSorted().join("|");
}

/**
 * Resolves the command references against the product options, in option
 * order: exactly one value per option and every value must belong to its
 * option. Returns the value public ids in option order (the order used to
 * insert the combo rows).
 */
export function resolveComboValuePublicIds(
  refs: readonly ComboValueRef[],
  options: readonly ProductOptionSnapshot[],
): string[] {
  if (refs.length !== options.length) {
    throw new BusinessRuleViolation(
      "Each variant must select exactly one value per option",
      ErrorCode.INVALID_INPUT,
      undefined,
      undefined,
    );
  }
  const byOption = new Map<string, string>();
  for (const ref of refs) {
    if (byOption.has(ref.optionPublicId)) {
      throw new BusinessRuleViolation(
        "The variant selects more than one value for the same option",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    byOption.set(ref.optionPublicId, ref.valuePublicId);
  }
  const ordered: string[] = [];
  for (const option of options) {
    const valuePublicId = byOption.get(option.publicId);
    if (valuePublicId === undefined) {
      throw new BusinessRuleViolation(
        "Each variant must select exactly one value per option",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    const belongs = option.values.some(
      (value) => value.publicId === valuePublicId,
    );
    if (!belongs) {
      throw new BusinessRuleViolation(
        "The selected value does not belong to the option",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    ordered.push(valuePublicId);
  }
  return ordered;
}

/**
 * Normalized keys of the combos of already persisted options, for duplicate
 * detection against the variant being created or modified.
 */
export async function existingComboKeys(
  reads: ExistingComboReader,
  variantInternalIds: readonly number[],
): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const variantInternalId of variantInternalIds) {
    const values = await reads.listComboValues(variantInternalId);
    keys.add(comboKey(values.map((value) => value.valuePublicId)));
  }
  return keys;
}

/** Contract slice needed to read the combos of persisted variants. */
export interface ExistingComboReader {
  listComboValues(variantInternalId: number): Promise<{ valuePublicId: string }[]>;
}

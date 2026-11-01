import { ValidateError } from "../../shared/errors/validate-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Sorting options of the public catalog listing. */
export enum CatalogSort {
  NAME = "name",
  PRICE = "price",
  NEWEST = "newest",
}

/**
 * Parses a raw sort value into {@link CatalogSort}.
 *
 * Throws when the value is not a valid sort option.
 */
export function parseCatalogSort(value: string): CatalogSort {
  const normalized = value.trim().toLowerCase();
  const match = Object.values(CatalogSort).find(
    (option: string) => option === normalized,
  );
  if (match === undefined) {
    throw new ValidateError(
      `Invalid catalog sort option: ${value}`,
      ErrorCode.INVALID_INPUT,
      "sort",
      undefined,
    );
  }
  return match;
}

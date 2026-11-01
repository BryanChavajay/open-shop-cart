import { BusinessRuleViolation } from "../../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../../domain/shared/enums/error-code.enum.js";

/**
 * Validates listing pagination. Pages start at 1; the page size is capped at
 * 100 like the rest of the modules.
 */
export function assertValidPagination(page: number, pageSize: number): void {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw new BusinessRuleViolation(
      "Pagination is invalid",
      ErrorCode.INVALID_INPUT,
      undefined,
      undefined,
    );
  }
}

import type { CouponReadRepository } from "../../domain/coupons/interfaces/repositories/coupon.repository.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface ListCouponsQuery {
  /** Pages start at 1. */
  page: number;
  /** Page size in rows, capped at 100. */
  pageSize: number;
  /** Restricts the listing to coupons currently active. */
  onlyActive: boolean;
}

/** Paginated admin listing of coupons (pure read, no transaction). */
export class ListCoupons {
  constructor(private readonly reads: CouponReadRepository) {}

  async execute(query: ListCouponsQuery) {
    if (
      !Number.isSafeInteger(query.page) ||
      query.page < 1 ||
      !Number.isSafeInteger(query.pageSize) ||
      query.pageSize < 1 ||
      query.pageSize > 100
    ) {
      throw new BusinessRuleViolation(
        "Pagination is invalid",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    return this.reads.listCoupons(query.page, query.pageSize, query.onlyActive);
  }
}

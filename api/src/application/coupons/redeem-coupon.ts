import { Coupon } from "../../domain/coupons/entities/coupon.entity.js";
import { CouponRedemption } from "../../domain/coupons/entities/coupon-redemption.entity.js";
import type {
  CouponReadRepository,
  CouponWriteRepository,
} from "../../domain/coupons/interfaces/repositories/coupon.repository.js";
import type {
  DiscountableLineItem,
  CouponApplicationResult,
  CouponEvaluationContext,
} from "../../domain/coupons/interfaces/coupon-evaluation-context.js";
import type { DiscountStrategyRegistry } from "../../domain/coupons/interfaces/discount-strategy.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";
import type { CouponActor } from "./shared/dependencies.js";
import { auditEntryForCoupons } from "./shared/audit.js";
import {
  buildCouponApplicationResult,
  formatAmount,
  sumAmounts,
} from "./shared/coupon-result.js";
import { requireInternalId } from "../shared/entity-ids.js";

export interface RedeemCouponCommand {
  actor: CouponActor;
  /** Redeeming customer (internal id of the user acting as buyer). */
  customerId: number;
  /** Coupon code as typed by the customer; persistence matches it uppercase. */
  code: string;
  /** Business reference of the sale where the discount is being applied. */
  saleReference: string;
  items: readonly DiscountableLineItem[];
  /** Coupons already applied to the cart; stacking is not allowed. */
  alreadyAppliedCouponCount: number;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

/**
 * A redemption additionally exposes the persisted coupon identifier so an
 * enclosing checkout can retain the order-to-coupon relationship.
 */
export interface RedeemedCouponApplicationResult extends CouponApplicationResult {
  readonly couponId: number;
}

/**
 * Redeems a coupon transactionally: locks the coupon row by code together
 * with the customer's use count (UPDLOCK read), re-validates every
 * redemption condition through the entity, computes the per-line discount
 * allocations, records the redemption and appends the audit entry — all
 * inside one transaction (or the caller-provided one via joinExecutor).
 *
 * The usage counters are incremented by the persistence guard (stored
 * procedure); if a concurrent redemption wins the race the guard raises its
 * own error and the sql-error mapping surfaces it as
 * ConflictError/COUPON_USAGE_LIMIT_EXHAUSTED.
 *
 * The returned CouponApplicationResult is the same shape EvaluateCoupon
 * produces: the totals are assembled by summation of the exact 2-decimal line
 * values (per-line precision lives inside the strategies).
 */
export class RedeemCoupon {
  constructor(
    private readonly reads: CouponReadRepository,
    private readonly writes: CouponWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
    private readonly registry: DiscountStrategyRegistry,
  ) {}

  async execute(
    command: RedeemCouponCommand,
  ): Promise<RedeemedCouponApplicationResult> {
    requireValidCustomerId(command.customerId);
    const code = requireNonEmptyCode(command.code);
    const saleReference = requireSaleReference(command.saleReference);

    const scope: TransactionScope<RedeemedCouponApplicationResult> = async (exec) => {
      const now = this.clock.now();

      // Row-locked read of the coupon plus this customer's recorded uses; the
      // lock keeps the limit checks and the increment atomic.
      const locked = await this.reads.findLockedCouponByCode(
        exec,
        code,
        command.customerId,
      );
      if (locked === null) {
        throw new NotFoundError(
          "Coupon not found",
          ErrorCode.COUPON_NOT_FOUND,
          undefined,
          undefined,
        );
      }
      const coupon = Coupon.restore(locked.snapshot);

      const context: CouponEvaluationContext = {
        customerId: command.customerId,
        // Overwritten with the locked count before every entity check.
        customerUsageCount: locked.customerUsageCount,
        alreadyAppliedCouponCount: command.alreadyAppliedCouponCount,
        evaluatedAt: now,
        items: command.items,
      };
      // Entity validation first: throws the specific COUPON_* business codes
      // and returns the lines the coupon applies to.
      const eligible = coupon.validateAndFilterEligibleItems(context);
      // Redeem re-asserts the conditions and increments the in-memory count.
      coupon.redeem(context);

      // The discount value travels to the strategy as an exact 2-decimal
      // string, the convention of DiscountCalculationStrategy.calculate.
      const strategy = this.registry.getStrategy(coupon.discountType);
      const allocations = strategy.calculate(
        formatAmount(coupon.discountValue),
        eligible,
      );

      const discountGross = sumAmounts(
        allocations.map((allocation) => allocation.discountGross),
      );

      const redemption = CouponRedemption.create({
        publicId: this.identifiers.newPublicId(),
        couponId: requireInternalId(coupon.id),
        userId: command.customerId,
        saleReference,
        discountAmount: Number(discountGross),
        usedAt: now.toISOString(),
      });
      // The stored procedure validates the limits again and increments the
      // persisted counters; a lost race surfaces as its documented error.
      await this.writes.recordCouponUse(exec, redemption);

      await this.audit.append(
        auditEntryForCoupons(
          {
            entityType: "Coupon",
            entityIdentifier: coupon.publicId,
            action: AuditAction.CREATE,
            newValues: {
              saleReference,
              discountAmount: Number(discountGross),
              customerId: command.customerId,
            },
          },
          command.actor,
        ),
        exec,
      );

      return {
        ...buildCouponApplicationResult(
          coupon,
          command.items,
          eligible,
          allocations,
        ),
        couponId: requireInternalId(coupon.id),
      };
    };

    return runOrJoin(command.joinExecutor ?? null, this.unitOfWork, scope);
  }
}

/** Input guards shared with EvaluateCoupon. */
function requireValidCustomerId(customerId: number): void {
  if (!Number.isSafeInteger(customerId) || customerId < 1) {
    throw new BusinessRuleViolation(
      "The field customerId must be an integer greater than zero",
      ErrorCode.INVALID_INPUT,
      "customerId",
      undefined,
    );
  }
}

function requireNonEmptyCode(code: string): string {
  const normalized = code.trim();
  if (normalized.length === 0) {
    throw new BusinessRuleViolation(
      "The required field code was not provided",
      ErrorCode.REQUIRED_FIELD_MISSING,
      "code",
      undefined,
    );
  }
  return normalized;
}

const SALE_REFERENCE_MAX_LENGTH = 100;

function requireSaleReference(saleReference: string): string {
  const trimmed = saleReference.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleViolation(
      "The required field saleReference was not provided",
      ErrorCode.REQUIRED_FIELD_MISSING,
      "saleReference",
      undefined,
    );
  }
  if (trimmed.length > SALE_REFERENCE_MAX_LENGTH) {
    throw new BusinessRuleViolation(
      `The sale reference exceeds ${SALE_REFERENCE_MAX_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      "saleReference",
      undefined,
    );
  }
  return trimmed;
}

import { ReserveStock } from "../inventory/reserve-stock.js";
import type { EvaluateCoupon } from "../coupons/evaluate-coupon.js";
import type {
  CouponApplicationResult,
  DiscountableLineItem,
} from "../../domain/coupons/interfaces/coupon-evaluation-context.js";
import type {
  AddressReadRepository,
  AddressReadModel,
} from "../../domain/addresses/interfaces/repositories/address.repository.js";
import type { ShippingRates } from "../../domain/checkout/interfaces/shipping-rates.js";
import type {
  CheckoutLinePayload,
  CheckoutReadRepository,
  QuotedVariant,
} from "../../domain/checkout/interfaces/repositories/checkout.repository.js";
import type { TaxCalculator } from "../../domain/shared/interfaces/providers/tax-calculator.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { formatAmount, sumAmounts } from "../coupons/shared/coupon-result.js";

/** Prefix of the inventory reservation created by a checkout initiation. */
export const RESERVATION_SOURCE_PREFIX = "checkout-reservation:";

export interface CheckoutQuoteLine {
  variantPublicId: string;
  sku: string;
  productName: string;
  variantName: string;
  quantity: number;
  /** Unit price with IVA 12% included, 2-decimal string. */
  unitPriceGross: string;
  subtotalGross: string;
  /** Discount assigned to the line when a coupon evaluates; null otherwise. */
  discountGross: string | null;
  finalGross: string;
}

export interface CheckoutInitiationReadModel {
  reservationPublicId: string;
  /** ISO instant the reservation expires (15 minutes after creation). */
  expiresAt: string;
  /** Cart subtotal with IVA included, 2-decimal string. */
  subtotalGross: string;
  /** Total coupon discount, 2-decimal string ("0.00" when absent). */
  discountGross: string;
  shippingCost: string;
  totalPayable: string;
  couponCode: string | null;
  lineItems: CheckoutQuoteLine[];
}

export interface InitiateCheckoutCommand {
  /** Owning customer, taken from the guarded identity. */
  customerId: number;
  lines: ReadonlyArray<CheckoutLinePayload>;
  addressPublicId?: string;
  couponCode?: string;
}

/**
 * Step 1 of the checkout: quotes the cart (catalog gross prices, coupon
 * evaluation and the shipping rate by department), reserves the units for
 * 15 minutes and returns the quote the confirm step will refine.
 *
 * The reservation is the only write: quoting is read-only, so a failing
 * coupon evaluation never holds stock. Availability races are the reserve
 * use case's domain (ConflictError/INSUFFICIENT_STOCK on the last unit).
 */
export class InitiateCheckout {
  constructor(
    private readonly checkoutReads: CheckoutReadRepository,
    private readonly addressReads: AddressReadRepository,
    private readonly inventory: { reserve: ReserveStock },
    private readonly coupons: { evaluate: EvaluateCoupon },
    private readonly shippingRates: ShippingRates,
    private readonly taxCalculator: TaxCalculator,
    private readonly identifiers: IdentifierGenerator,
  ) {}

  async execute(
    command: InitiateCheckoutCommand,
  ): Promise<CheckoutInitiationReadModel> {
    const lines = requireValidLines(command.lines);
    const quoted = await this.checkoutReads.quoteVariants(lines);
    if (quoted.length !== lines.length) {
      throw new NotFoundError(
        "Variant not found",
        undefined,
        undefined,
        undefined,
      );
    }
    for (const variant of quoted) {
      assertQuotable(variant);
    }

    const deliveryAddress =
      command.addressPublicId === undefined
        ? null
        : await requireOwnedAddress(
            this.addressReads,
            command.customerId,
            command.addressPublicId,
          );
    const shippingCost =
      deliveryAddress === null
        ? "0.00"
        : formatAmount(
            this.shippingRates.rateForDepartment(
              deliveryAddress.departmentName,
            ),
          );

    // Coupon evaluation is a plain simulation; redemption (the authoritative
    // version, race-protected) happens inside the confirmation transaction.
    const discountItems = buildDiscountableItems(quoted, this.taxCalculator);
    let couponResult: CouponApplicationResult | null = null;
    if (command.couponCode !== undefined) {
      couponResult = await this.coupons.evaluate.execute({
        customerId: command.customerId,
        code: command.couponCode,
        items: discountItems,
        alreadyAppliedCouponCount: 0,
      });
    }
    const allocationByLine =
      couponResult === null
        ? new Map<string, string>()
        : new Map(
            couponResult.lineAllocations.map((a) => [
              a.linePublicId,
              a.discountGross,
            ]),
          );

    const reservation = await this.inventory.reserve.execute({
      userId: command.customerId,
      sourceReference: `${RESERVATION_SOURCE_PREFIX}${this.identifiers.newPublicId()}`,
      lines: lines.map((line) => ({
        variantPublicId: line.variantPublicId,
        quantity: line.quantity,
      })),
      joinExecutor: null,
    });

    const subtotalGross = sumAmounts(
      discountItems.map((item) => item.subtotalGross),
    );
    const discountGross =
      couponResult === null ? "0.00" : couponResult.discountGross;
    const totalPayable = formatAmount(
      Number(subtotalGross) - Number(discountGross) + Number(shippingCost),
    );

    return {
      reservationPublicId: reservation.publicId,
      expiresAt: reservation.expiresAt,
      subtotalGross,
      discountGross,
      shippingCost,
      totalPayable,
      couponCode: couponResult === null ? null : couponResult.code,
      lineItems: lines.map((line) => {
        const variant = requireVariant(quoted, line.variantPublicId);
        const gross = grossLineBase(variant, line.quantity, this.taxCalculator);
        const discount = allocationByLine.get(line.variantPublicId) ?? null;
        return {
          variantPublicId: line.variantPublicId,
          sku: variant.sku,
          productName: variant.productName,
          variantName: variant.variantName,
          quantity: line.quantity,
          unitPriceGross: gross.unitPriceGross,
          subtotalGross: gross.subtotalGross,
          discountGross: discount,
          finalGross:
            discount === null
              ? gross.subtotalGross
              : formatAmount(Number(gross.subtotalGross) - Number(discount)),
        };
      }),
    };
  }
}

/** Resolves the customer-owned delivery address (unknown/foreign = 404). */
export async function requireOwnedAddress(
  reads: AddressReadRepository,
  customerId: number,
  addressPublicId: string,
): Promise<AddressReadModel> {
  const detail = await reads.findOwnDetailByPublicId(
    customerId,
    addressPublicId,
  );
  if (detail === null) {
    throw new NotFoundError(
      "Address not found",
      ErrorCode.ADDRESS_NOT_FOUND,
      undefined,
      undefined,
    );
  }
  return detail;
}

/** Rejects variants that cannot be quoted for a purchase. */
export function assertQuotable(variant: QuotedVariant): void {
  if (
    variant.variantDeleted ||
    !variant.variantActive ||
    !variant.productActive
  ) {
    throw new ConflictError(
      "The variant is not commercially available",
      ErrorCode.INVALID_CATALOG_ENTITY_STATE,
      undefined,
      undefined,
    );
  }
}

/** Validates the line structure of a quote/confirmation request. */
export function requireValidLines(
  lines: ReadonlyArray<CheckoutLinePayload>,
): ReadonlyArray<CheckoutLinePayload> {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new BusinessRuleViolation(
      "A checkout requires at least one line",
      ErrorCode.EMPTY_CHECKOUT_ITEMS,
      "lines",
      undefined,
    );
  }
  const seen = new Set<string>();
  for (const line of lines) {
    const publicId =
      typeof line.variantPublicId === "string"
        ? line.variantPublicId.trim()
        : "";
    if (publicId.length === 0) {
      throw new BusinessRuleViolation(
        "Every line must carry a variant public id",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "lines",
        undefined,
      );
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new BusinessRuleViolation(
        "The line quantities must be whole numbers greater than zero",
        ErrorCode.INVALID_INPUT,
        "lines",
        undefined,
      );
    }
    if (seen.has(publicId)) {
      throw new ConflictError(
        "A checkout cannot repeat the same variant in multiple lines",
        ErrorCode.INVALID_INPUT,
        "lines",
        undefined,
      );
    }
    seen.add(publicId);
  }
  return lines;
}

/** Unit price and line subtotal, gross (IVA 12% included). */
export function grossLineBase(
  variant: QuotedVariant,
  quantity: number,
  tax: TaxCalculator,
): { unitPriceGross: string; subtotalGross: string } {
  const unitPriceGross = tax.addTax(formatAmount(variant.netUnitPrice));
  const subtotalGross = formatAmount(Number(unitPriceGross) * quantity);
  return { unitPriceGross, subtotalGross };
}

/** Builds the coupon evaluation items from the quoted variants. */
export function buildDiscountableItems(
  quoted: QuotedVariant[],
  tax: TaxCalculator,
): DiscountableLineItem[] {
  return quoted.map((variant) => {
    const base = grossLineBase(variant, variant.requestedQuantity, tax);
    return {
      linePublicId: variant.variantPublicId,
      variantPublicId: variant.variantPublicId,
      categoryPublicId: variant.categoryPublicId,
      quantity: variant.requestedQuantity,
      unitPriceGross: base.unitPriceGross,
      subtotalGross: base.subtotalGross,
    };
  });
}

function requireVariant(
  quoted: QuotedVariant[],
  variantPublicId: string,
): QuotedVariant {
  const variant = quoted.find((row) => row.variantPublicId === variantPublicId);
  if (variant === undefined) {
    throw new NotFoundError(
      "Variant not found",
      undefined,
      undefined,
      undefined,
    );
  }
  return variant;
}

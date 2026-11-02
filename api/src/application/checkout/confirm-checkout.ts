import type { InventoryReadRepository } from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { ConsumeStockReservation } from "../inventory/consume-stock-reservation.js";
import type { ConvertCart } from "../cart/convert-cart.js";
import type { RedeemCoupon } from "../coupons/redeem-coupon.js";
import type { AddressReadRepository } from "../../domain/addresses/interfaces/repositories/address.repository.js";
import type { ShippingRates } from "../../domain/checkout/interfaces/shipping-rates.js";
import type {
  PaymentDetails,
  PaymentStrategyRegistry,
} from "../../domain/checkout/interfaces/payment-strategy.js";
import { PaymentMethod } from "../../domain/checkout/enums/payment-method.enum.js";
import type { PaymentStatus } from "../../domain/checkout/enums/payment-status.enum.js";
import type { OrderStatus } from "../../domain/checkout/enums/order-status.enum.js";
import type { OrderSnapshot } from "../../domain/checkout/entities/order.entity.js";
import type {
  CheckoutLinePayload,
  CheckoutReadRepository,
  CheckoutWriteRepository,
  OrderLineRow,
  QuotedVariant,
} from "../../domain/checkout/interfaces/repositories/checkout.repository.js";
import type { TaxCalculator } from "../../domain/shared/interfaces/providers/tax-calculator.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { formatAmount, sumAmounts } from "../coupons/shared/coupon-result.js";
import { canonicalFingerprint } from "../inventory/shared/options.js";
import {
  assertQuotable,
  buildDiscountableItems,
  grossLineBase,
  requireOwnedAddress,
  requireValidLines,
} from "./initiate-checkout.js";
import { auditEntryForCheckout } from "./shared/audit.js";
import { formatOrderNumber } from "./shared/order-number.js";

/** Client evidence of the chosen payment method (schema-discriminated). */
export type PaymentSelection =
  | {
      method: typeof PaymentMethod.BANK_TRANSFER;
      bankName: string;
      referenceNumber: string;
    }
  | { method: typeof PaymentMethod.CASH_ON_DELIVERY }
  | { method: typeof PaymentMethod.CARD; source: string };

export interface ConfirmCheckoutCommand {
  /** Customer taken from the guarded identity, never from the body. */
  customerId: number;
  /** Client idempotency key (Idempotency-Key header), 1..100 chars. */
  idempotencyKey: string;
  reservationPublicId: string;
  addressPublicId: string;
  couponCode?: string;
  /** Raw cart token when the client carries one; closes it as CONVERTED. */
  cartToken?: string | null;
  lines: ReadonlyArray<CheckoutLinePayload>;
  payment: PaymentSelection;
}

/** Frozen checkout line of the created order. */
export interface FrozenLineReadModel {
  linePublicId: string;
  variantPublicId: string;
  sku: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPriceGross: string;
  subtotalGross: string;
  discountGross: string;
  totalGross: string;
}

export interface CheckoutConfirmationReadModel {
  orderPublicId: string;
  orderNumber: string;
  createdAt: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotalGross: string;
  discountTotal: string;
  shippingCost: string;
  taxTotal: string;
  totalPayable: string;
  couponCode: string | null;
  lineItems: FrozenLineReadModel[];
}

/**
 * Step 2 of the checkout (confirmation): everything runs inside ONE
 * transaction, so the creation is atomic (order + lines + SALE kardex
 * movements + coupon redemption + payment record + cart conversion + audit):
 *
 *   1. Idempotency: the (customer, key) receipt is locked-read; an equal
 *      fingerprint replays the stored confirmation without new writes and a
 *      different one conflicts (IDEMPOTENCY_CONFLICT).
 *   2. The address is re-read (ownership enforced) and the reservation is
 *      verified to belong to this customer.
 *   3. The catalog is re-quoted at the transaction instant (prices may have
 *      changed while the reservation held; the confirmation freezes what the
 *      client confirms now) and the coupon is redeemed race-safely.
 *   4. The payment strategy decides the initial order/payment states; a card
 *      decline rolls the whole transaction back, leaving no partial data.
 *   5. Order, frozen lines, payment record, reservation consumption (SALE
 *      kardex movements against the order) and the cart conversion persist
 *      together; the audit and the idempotency receipt close the unit.
 */
export class ConfirmCheckout {
  constructor(
    private readonly checkoutReads: CheckoutReadRepository,
    private readonly checkoutWrites: CheckoutWriteRepository,
    private readonly addressReads: AddressReadRepository,
    private readonly inventoryReads: InventoryReadRepository,
    private readonly inventory: { consume: ConsumeStockReservation },
    private readonly coupons: { redeem: RedeemCoupon },
    private readonly carts: { convert: ConvertCart },
    private readonly paymentStrategies: PaymentStrategyRegistry,
    private readonly shippingRates: ShippingRates,
    private readonly taxCalculator: TaxCalculator,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ConfirmCheckoutCommand,
  ): Promise<CheckoutConfirmationReadModel> {
    const lines = requireValidLines(command.lines);
    const fingerprint = canonicalFingerprint({
      reservationPublicId: command.reservationPublicId,
      addressPublicId: command.addressPublicId,
      couponCode: command.couponCode ?? null,
      cartToken: command.cartToken ?? null,
      lines,
      payment: command.payment,
    });

    const scope: TransactionScope<CheckoutConfirmationReadModel> = async (
      exec,
    ) => {
      // (1) Idempotency receipt under lock; concurrent retries queue here.
      const operation = await this.checkoutReads.findOperation(
        command.customerId,
        command.idempotencyKey,
      );
      if (operation !== null) {
        if (operation.fingerprint !== fingerprint) {
          throw new ConflictError(
            "The idempotency key was already used with different content",
            ErrorCode.IDEMPOTENCY_CONFLICT,
            "Idempotency-Key",
            undefined,
          );
        }
        return this.replay(exec, operation.orderPublicId, command.customerId);
      }

      // (2) Address + reservation ownership (unknown/foreign = specific 404).
      const address = await requireOwnedAddress(
        this.addressReads,
        command.customerId,
        command.addressPublicId,
      );
      const reservation = await this.inventoryReads.findReservationByPublicId(
        command.reservationPublicId,
      );
      if (reservation === null || reservation.userId !== command.customerId) {
        throw new NotFoundError(
          "Stock reservation not found",
          ErrorCode.STOCK_RESERVATION_NOT_FOUND,
          undefined,
          undefined,
        );
      }
      if (reservation.id === null) {
        throw new Error("La reserva no devolvio su id interno");
      }
      const reservationInternalId = reservation.id;

      // (3) Fresh quote at the transaction instant.
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
      const discountItems = buildDiscountableItems(quoted, this.taxCalculator);

      // The order public id resolves before every write because the coupon
      // redemption and the reservation consumption both reference it.
      const orderPublicId = this.identifiers.newPublicId();
      let allocations = new Map<string, string>();
      let couponCode: string | null = null;
      if (command.couponCode !== undefined) {
        const redeemed = await this.coupons.redeem.execute({
          actor: { id: command.customerId },
          customerId: command.customerId,
          code: command.couponCode,
          saleReference: orderPublicId,
          items: discountItems,
          alreadyAppliedCouponCount: 0,
          joinExecutor: exec,
        });
        allocations = new Map(
          redeemed.lineAllocations.map((a) => [
            a.linePublicId,
            a.discountGross,
          ]),
        );
        couponCode = redeemed.code;
      }

      // (4) Amounts frozen in quetzales (IVA 12% included, tax split app-side).
      const shippingCost = formatAmount(
        this.shippingRates.rateForDepartment(address.departmentName),
      );
      const totals = computeTotals(
        quoted,
        allocations,
        this.taxCalculator,
        shippingCost,
      );

      const now = this.clock.now();
      const nowIso = now.toISOString();
      const strategy = this.paymentStrategies.getStrategy(
        command.payment.method,
      );
      const paymentResult = await strategy.execute({
        orderPublicId,
        amountGross: totals.totalPayable,
        idempotencyKey: command.idempotencyKey,
        details: toPaymentDetails(command.payment),
      });

      // (5) Atomic persistence of the order and every companion record.
      const snapshot: OrderSnapshot = {
        id: null,
        publicId: orderPublicId,
        orderNumber: formatOrderNumber(now, this.identifiers.newPublicId()),
        userId: command.customerId,
        addressOriginPublicId: address.publicId,
        reservationId: reservationInternalId,
        couponId: null,
        couponCode,
        recipientFirstName: address.recipientFirstName,
        recipientLastName: address.recipientLastName,
        deliveryPhone: address.phone,
        deliveryDepartment: address.departmentName,
        deliveryMunicipality: address.municipalityName,
        deliveryExactAddress: address.exactAddress,
        deliveryReference: address.reference,
        subtotalGross: Number(totals.subtotalGross),
        discountTotal: Number(totals.discountTotal),
        shippingCost: Number(shippingCost),
        totalNet: Number(totals.totalNet),
        totalTax: Number(totals.totalTax),
        totalPayable: Number(totals.totalPayable),
        orderStatus: paymentResult.orderStatus,
        paymentStatus: paymentResult.paymentStatus,
        paymentMethod: command.payment.method,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const orderId = await this.checkoutWrites.insertOrder(exec, snapshot);

      const linePublicIds: string[] = [];
      for (const variant of quoted) {
        const linePublicId = this.identifiers.newPublicId();
        linePublicIds.push(linePublicId);
        const gross = grossLineBase(
          variant,
          variant.requestedQuantity,
          this.taxCalculator,
        );
        const discount = formatAmount(
          Number(allocations.get(variant.variantPublicId) ?? 0),
        );
        await this.checkoutWrites.insertOrderLine(exec, {
          publicId: linePublicId,
          orderId,
          variantId: variant.variantId,
          sku: variant.sku,
          productName: variant.productName,
          variantName: variant.variantName,
          quantity: variant.requestedQuantity,
          unitPriceNet: variant.netUnitPrice,
          unitPriceGross: Number(gross.unitPriceGross),
          subtotalGross: Number(gross.subtotalGross),
          discountGross: Number(discount),
          totalGross: Number(
            formatAmount(Number(gross.subtotalGross) - Number(discount)),
          ),
        });
      }

      await this.checkoutWrites.insertPayment(exec, {
        publicId: this.identifiers.newPublicId(),
        orderId,
        method: command.payment.method,
        status: paymentResult.paymentStatus,
        amount: snapshot.totalPayable,
        bankName:
          command.payment.method === PaymentMethod.BANK_TRANSFER
            ? command.payment.bankName
            : null,
        referenceNumber: paymentResult.referenceNumber,
        providerData: paymentResult.providerData,
      });

      await this.checkoutWrites.appendOrderHistory(exec, {
        orderId,
        previousStatus: null,
        newStatus: paymentResult.orderStatus,
        userId: command.customerId,
        reason: "Order created at checkout",
        occurredAt: nowIso,
      });

      // Consuming the reservation closes the stock hold against the order; a
      // reservation expired while the client was filling the form surfaces
      // STOCK_RESERVATION_EXPIRED and rolls the whole confirmation back.
      await this.inventory.consume.execute({
        actor: { id: command.customerId },
        reservationPublicId: command.reservationPublicId,
        salePublicId: orderPublicId,
        joinExecutor: exec,
      });

      // Cart conversion is best effort: confirming without an active guest
      // cart (no token or already-closed) still succeeds.
      if (
        typeof command.cartToken === "string" &&
        command.cartToken.trim() !== ""
      ) {
        await this.closeCart(command.cartToken, exec);
      }

      await this.audit.append(
        auditEntryForCheckout(
          {
            entityType: "Order",
            entityIdentifier: orderPublicId,
            action: AuditAction.CREATE,
            newValues: {
              orderNumber: snapshot.orderNumber,
              reservationId: reservationInternalId,
              totalPayable: totals.totalPayable,
              method: command.payment.method,
              orderStatus: paymentResult.orderStatus,
              paymentStatus: paymentResult.paymentStatus,
            },
          },
          { id: command.customerId },
        ),
        exec,
      );

      await this.checkoutWrites.saveOperation(exec, {
        customerId: command.customerId,
        idempotencyKey: command.idempotencyKey,
        fingerprint,
        orderId,
      });

      return {
        orderPublicId,
        orderNumber: snapshot.orderNumber,
        createdAt: nowIso,
        orderStatus: paymentResult.orderStatus,
        paymentStatus: paymentResult.paymentStatus,
        paymentMethod: command.payment.method,
        subtotalGross: totals.subtotalGross,
        discountTotal: totals.discountTotal,
        shippingCost,
        taxTotal: totals.totalTax,
        totalPayable: totals.totalPayable,
        couponCode,
        lineItems: this.frozenLines(quoted, linePublicIds, allocations),
      };
    };

    return this.unitOfWork.run(scope);
  }

  /** Builds the replayed confirmation from the stored order. */
  private async replay(
    exec: CommandExecutor,
    orderPublicId: string,
    customerId: number,
  ): Promise<CheckoutConfirmationReadModel> {
    const header = await this.checkoutReads.findOrderRow(exec, {
      orderPublicId,
      customerId,
    });
    if (header === null) {
      throw new NotFoundError(
        "Order not found",
        ErrorCode.ORDER_NOT_FOUND,
        undefined,
        undefined,
      );
    }
    const lineRows = await this.checkoutReads.listOrderLines(
      exec,
      orderPublicId,
    );
    return {
      orderPublicId: header.publicId,
      orderNumber: header.orderNumber,
      createdAt: header.createdAt,
      orderStatus: header.orderStatus,
      paymentStatus: header.paymentStatus,
      paymentMethod: header.paymentMethod,
      subtotalGross: formatAmount(header.subtotalGross),
      discountTotal: formatAmount(header.discountTotal),
      shippingCost: formatAmount(header.shippingCost),
      taxTotal: formatAmount(header.totalTax),
      totalPayable: formatAmount(header.totalPayable),
      couponCode: null,
      lineItems: lineRows.map(toFrozenLine),
    };
  }

  /** Closes the guest cart as CONVERTED, tolerating an absent cart. */
  private async closeCart(token: string, exec: CommandExecutor): Promise<void> {
    try {
      await this.carts.convert.execute({ token, joinExecutor: exec });
    } catch (error: unknown) {
      if (
        error instanceof BusinessRuleViolation &&
        error.code === "CART_NOT_FOUND"
      ) {
        return;
      }
      throw error;
    }
  }

  private frozenLines(
    quoted: QuotedVariant[],
    linePublicIds: string[],
    allocations: Map<string, string>,
  ): FrozenLineReadModel[] {
    return quoted.map((variant, index) => {
      const gross = grossLineBase(
        variant,
        variant.requestedQuantity,
        this.taxCalculator,
      );
      const discount = formatAmount(
        Number(allocations.get(variant.variantPublicId) ?? 0),
      );
      return {
        linePublicId: linePublicIds[index]!,
        variantPublicId: variant.variantPublicId,
        sku: variant.sku,
        productName: variant.productName,
        variantName: variant.variantName,
        quantity: variant.requestedQuantity,
        unitPriceGross: gross.unitPriceGross,
        subtotalGross: gross.subtotalGross,
        discountGross: discount,
        totalGross: formatAmount(
          Number(gross.subtotalGross) - Number(discount),
        ),
      };
    });
  }
}

function toFrozenLine(line: OrderLineRow): FrozenLineReadModel {
  return {
    linePublicId: line.linePublicId,
    variantPublicId: line.variantPublicId,
    sku: line.sku,
    productName: line.productName,
    variantName: line.variantName,
    quantity: line.quantity,
    unitPriceGross: formatAmount(line.unitPriceGross),
    subtotalGross: formatAmount(line.subtotalGross),
    discountGross: formatAmount(line.discountGross),
    totalGross: formatAmount(line.totalGross),
  };
}

/** Totals frozen on the order (all 2-decimal strings). */
export interface CheckoutTotals {
  subtotalGross: string;
  discountTotal: string;
  totalNet: string;
  totalTax: string;
  totalPayable: string;
}

/**
 * Sums the frozen line subtotals and discounts, splits the product gross into
 * its tax (IVA 12%) portion, and adds the shipping (not taxable in this
 * scope). Shipping and discount are summed last so TotalPagar equals the
 * database row.
 */
export function computeTotals(
  quoted: QuotedVariant[],
  allocations: Map<string, string>,
  tax: TaxCalculator,
  shippingCost: string,
): CheckoutTotals {
  const subtotalGross = sumAmounts(
    quoted.map(
      (variant) =>
        grossLineBase(variant, variant.requestedQuantity, tax).subtotalGross,
    ),
  );
  const discountTotal = sumAmounts([...allocations.values()]);
  const productGrossAfterDiscount = formatAmount(
    Number(subtotalGross) - Number(discountTotal),
  );
  const totalNet = tax.removeTax(productGrossAfterDiscount);
  const totalTax = formatAmount(
    Number(productGrossAfterDiscount) - Number(totalNet),
  );
  const totalPayable = formatAmount(
    Number(productGrossAfterDiscount) + Number(shippingCost),
  );
  return { subtotalGross, discountTotal, totalNet, totalTax, totalPayable };
}

/** Maps the client selection to the domain payment details union. */
export function toPaymentDetails(selection: PaymentSelection): PaymentDetails {
  switch (selection.method) {
    case PaymentMethod.BANK_TRANSFER:
      return {
        method: PaymentMethod.BANK_TRANSFER,
        bankName: selection.bankName,
        referenceNumber: selection.referenceNumber,
      };
    case PaymentMethod.CASH_ON_DELIVERY:
      return { method: PaymentMethod.CASH_ON_DELIVERY };
    case PaymentMethod.CARD:
      return { method: PaymentMethod.CARD, source: selection.source };
    default: {
      const unhandled: never = selection;
      throw new BusinessRuleViolation(
        `Unknown payment method "${String(unhandled)}"`,
        ErrorCode.INVALID_PAYMENT_DETAILS,
        "payment",
        undefined,
      );
    }
  }
}

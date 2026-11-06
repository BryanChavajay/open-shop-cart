import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/**
 * One frozen line of a registered order, as persisted at checkout. The
 * amounts are frozen (gross, IVA 12% included, quetzales, scale 2 as
 * numbers); quantities come from the purchase and may grow through
 * returns. Maps 1:1 the line rowset of the order-detail stored procedures.
 */
export interface OrderLineSnapshot {
  /** Internal identifier of the persisted order line. */
  lineId: number;
  /** Public identifier of the order line (UUID). */
  linePublicId: string;
  /** Internal identifier of the sold variant. */
  variantId: number;
  /** Public identifier of the sold variant. */
  variantPublicId: string;
  /** SKU frozen at purchase time (survives SKU changes). */
  sku: string;
  /** Product name frozen at purchase time. */
  productName: string;
  /** Variant label frozen at purchase time. */
  variantName: string;
  /** Units purchased on this line. */
  quantity: number;
  /** Units already returned from this line. */
  quantityReturned: number;
  /** Net (tax-free) unit price. */
  unitPriceNet: number;
  /** Gross (IVA included) unit price. */
  unitPriceGross: number;
  /** Gross amount before line discount, for all purchased units. */
  subtotalGross: number;
  /** Discount applied to the whole line. */
  discountGross: number;
  /** Final gross amount of the line. */
  totalGross: number;
}

/**
 * Validates and applies a return on one order line. The sum of what is
 * already returned plus the requested quantity must stay inside the
 * purchased quantity of the line. Pure: mutates nothing in persistence; the
 * caller writes the returned snapshot through the repository.
 */
export function applyReturnLine(
  line: OrderLineSnapshot,
  requestedQuantity: number,
  occurredAt: string,
): OrderLineSnapshot {
  void occurredAt; // Reserved for future line audit stamps; no field yet.
  if (requestedQuantity <= 0) {
    throw new BusinessRuleViolation(
      "The requested return quantity must be greater than zero",
      ErrorCode.INVALID_INPUT,
      line.linePublicId,
      undefined,
    );
  }
  if (line.quantityReturned + requestedQuantity > line.quantity) {
    throw new BusinessRuleViolation(
      "The requested return quantity exceeds the purchased quantity of the line",
      ErrorCode.ORDER_RETURN_EXCEEDS_PURCHASED,
      line.linePublicId,
      undefined,
    );
  }
  return {
    ...line,
    quantityReturned: line.quantityReturned + requestedQuantity,
  };
}

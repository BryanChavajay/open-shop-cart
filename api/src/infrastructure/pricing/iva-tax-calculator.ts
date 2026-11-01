import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { TaxCalculator } from "../../domain/shared/interfaces/providers/tax-calculator.js";

/** Fixed IVA rate: 12 percent. */
const IVA_PERCENT = 12n;
/** Total percentage factor applied on the net amount (100 + IVA). */
const ADD_TAX_FACTOR = 100n + IVA_PERCENT;
/** Decimal scale of all amounts (two digits). */
const SCALE_FACTOR = 100n;

/** Half of the tax divisor and of the scale factor, for deterministic half-up rounding. */
const ADD_TAX_FACTOR_HALF = ADD_TAX_FACTOR / 2n;
const SCALE_FACTOR_HALF = SCALE_FACTOR / 2n;

/** Sign-agnostic half-up rounding of `value / divisor`, rounding by magnitude. */
function divideHalfUp(value: bigint, divisor: bigint, half: bigint): bigint {
  const quotient = value >= 0n ? value : -value;
  const rounded = (quotient + half) / divisor;
  return value >= 0n ? rounded : -rounded;
}

/** Formats a scale-2 BigInt amount into the canonical "d.dd" string. */
function formatScaled(scaled: bigint): string {
  const magnitude = scaled >= 0n ? scaled : -scaled;
  const whole = magnitude / SCALE_FACTOR;
  const cents = magnitude % SCALE_FACTOR;
  const sign = scaled < 0n ? "-" : "";
  return `${sign}${whole}.${cents.toString().padStart(2, "0")}`;
}

/**
 * Parses a decimal amount string into a scale-2 BigInt.
 *
 * Accepted: optional sign, plain digits, and an exact 1-or-2-digit decimal
 * part ("100", "100.5", "100.55"). More decimals or malformed input are
 * rejected: amounts in the domain always travel with at most two decimals.
 */
function parseAmount(amount: string): bigint {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (match === null) {
    throw new BusinessRuleViolation(
      `The amount "${amount}" is not a decimal string with at most two decimals`,
      ErrorCode.INVALID_CATALOG_ENTITY_STATE,
      amount,
      undefined,
    );
  }
  const [, sign, wholePart, decimalPart = "0"] = match;
  const signPrefix = sign ?? "";
  const wholeDigits = wholePart ?? "0";
  const normalizedDecimal = decimalPart.padEnd(2, "0");
  const scaled = BigInt(wholeDigits) * SCALE_FACTOR + BigInt(normalizedDecimal);
  return signPrefix === "-" ? -scaled : scaled;
}

/**
 * Tax calculator with the fixed IVA rate of 12%.
 *
 * All arithmetic is performed with scaled BigInt amounts: no floating point
 * is involved, and every result is rounded half-up (by magnitude) to two
 * decimals before formatting.
 */
export class IvaTaxCalculator implements TaxCalculator {
  /** Converts an amount to its tax-inclusive representation, e.g. "112.00". */
  addTax(netAmount: string): string {
    const scaledNet = parseAmount(netAmount);
    return formatScaled(divideHalfUp(scaledNet * ADD_TAX_FACTOR, SCALE_FACTOR, SCALE_FACTOR_HALF));
  }

  /** Converts an amount to its net representation, e.g. "112.00" -> "100.00". */
  removeTax(grossAmount: string): string {
    const scaledGross = parseAmount(grossAmount);
    return formatScaled(
      divideHalfUp(scaledGross * SCALE_FACTOR, ADD_TAX_FACTOR, ADD_TAX_FACTOR_HALF),
    );
  }
}

import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

/**
 * Internal money math shared by the pricing engine (discount strategies, tax
 * calculators). Duplicated from `iva-tax-calculator.ts`, whose module-local
 * helpers cannot be imported from outside its file.
 *
 * All arithmetic is performed with scale-2 BigInt amounts: no floating point
 * is involved, and every result is rounded half-up (by magnitude) to two
 * decimals before formatting.
 */

/** Decimal scale of all money amounts (two digits). */
export const SCALING_FACTOR = 100n;

/** Denominator applied to a scale-2 percent over a scale-2 amount (100 * 100). */
export const PERCENT_DENOMINATOR = 10000n;

/** Half of PERCENT_DENOMINATOR, for deterministic half-up rounding. */
export const PERCENT_DENOMINATOR_HALF = 5000n;

/** Sign-agnostic half-up rounding of `value / divisor`, rounding by magnitude. */
export function divideHalfUp(value: bigint, divisor: bigint, half: bigint): bigint {
  const quotient = value >= 0n ? value : -value;
  const rounded = (quotient + half) / divisor;
  return value >= 0n ? rounded : -rounded;
}

/** Formats a scale-2 BigInt amount into the canonical "d.dd" string (negative allowed). */
export function formatScaled(scaled: bigint): string {
  const magnitude = scaled >= 0n ? scaled : -scaled;
  const whole = magnitude / SCALING_FACTOR;
  const cents = magnitude % SCALING_FACTOR;
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
export function parseAmount(amount: string): bigint {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (match === null) {
    throw new BusinessRuleViolation(
      `The amount "${amount}" is not a decimal string with at most two decimals`,
      ErrorCode.INVALID_INPUT,
      amount,
      undefined,
    );
  }
  const [, sign, wholePart, decimalPart = "0"] = match;
  const signPrefix = sign ?? "";
  const wholeDigits = wholePart ?? "0";
  const normalizedDecimal = decimalPart.padEnd(2, "0");
  const scaled = BigInt(wholeDigits) * SCALING_FACTOR + BigInt(normalizedDecimal);
  return signPrefix === "-" ? -scaled : scaled;
}

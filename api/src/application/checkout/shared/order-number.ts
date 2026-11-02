import { BusinessRuleViolation } from "../../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../../domain/shared/enums/error-code.enum.js";

/** Serial of the day, e.g. "0A7F" or "000B". */
export interface OrderNumberMeta {
  year: number;
  month: number;
  day: number;
  serial: string;
}

/** Day format shared by the order numbers. */
export function formatDateMeta(now: Date): string {
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Human-readable order number: ORD-YYYYMMDD-XXXX with four random
 * alphanumeric characters. The unique index on NumeroPedido backs the
 * randomness; a collision fails the confirmation and surfaces to the client
 * as a conflict (realistically never encountered with 4 characters).
 */
export function formatOrderNumber(
  now: Date,
  seed: string,
): string {
  const serial = normalizeSerial(seed);
  return `ORD-${formatDateMeta(now)}-${serial}`;
}

/** Keeps the digits and letters of the seed, uppercase, four characters. */
function normalizeSerial(seed: string): string {
  const alphanum = seed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const candidate = alphanum.slice(0, 4).padStart(4, "0");
  if (!/^[0-9A-Z]{4}$/.test(candidate)) {
    throw new BusinessRuleViolation(
      "The order number seed is empty",
      ErrorCode.INVALID_INPUT,
      undefined,
      undefined,
    );
  }
  return candidate;
}

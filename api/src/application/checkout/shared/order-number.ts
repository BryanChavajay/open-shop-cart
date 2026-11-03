import { randomInt } from "node:crypto";

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

/** Unambiguous serial alphabet (no 0/O, 1/I) shared with the SKU generator. */
const SERIAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SERIAL_LENGTH = 4;

/**
 * Human-readable order number: ORD-YYYYMMDD-XXXX with four cryptographically
 * random characters from the unambiguous alphabet (31^4 ≈ 923k serials a day).
 * It never derives from seeded ids: the time-ordered UUID v7 used for public
 * ids shares its first characters across a ~50-day window, so slicing it made
 * every same-day order collide against the unique index on NumeroPedido. The
 * index still backs a residual collision as a conflict surfaced to the client.
 */
export function formatOrderNumber(
  now: Date,
): string {
  let serial = "";
  for (let index = 0; index < SERIAL_LENGTH; index++) {
    serial += SERIAL_ALPHABET.charAt(randomInt(SERIAL_ALPHABET.length));
  }
  return `ORD-${formatDateMeta(now)}-${serial}`;
}

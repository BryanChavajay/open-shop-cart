/** Stock reservations last this many minutes (maximum accepted by the entity). */
export const RESERVATION_DURATION_MINUTES = 15;

/** Default maximum number of reservations processed per expiry cycle. */
export const EXPIRY_BATCH_SIZE = 50;

/** Stable serialization of `payload`: object keys sorted recursively and the
 * `idempotencyKey` field stripped anywhere in the structure (it is the one
 * input that legitimately differs between retries). Arrays keep their order. */
export function canonicalFingerprint(payload: unknown): string {
  return JSON.stringify(stableValue(payload));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (key === "idempotencyKey") {
        continue;
      }
      result[key] = stableValue(item);
    }
    return result;
  }
  return value;
}

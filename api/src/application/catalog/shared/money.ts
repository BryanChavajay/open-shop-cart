/**
 * Formats an amount with exactly two decimals (half-up, no significant float
 * drift for typical scale-2 inputs). Presentation validates the raw input.
 */
export function toDecimalString(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2);
}

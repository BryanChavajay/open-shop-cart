/** Exact decimal tax conversion for catalog prices. Amounts travel as strings. */
export interface TaxCalculator {
  /** Adds tax to a net amount ("100.00" -> gross string, e.g. "112.00"). */
  addTax(netAmount: string): string;
  /** Removes tax from a gross amount ("112.00" -> net string). */
  removeTax(grossAmount: string): string;
}

// Implementation contract notes (not part of the interface):
// - Rounding MUST be explicit: 2 decimals, half-up.
// - removeTax(addTax(x)) is not guaranteed to return exactly x (rounding).

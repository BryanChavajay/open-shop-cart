/**
 * Shipping rate port: flat rates by destination department for Guatemala.
 * The checkout freezes the resolved rate on the order, so changing the
 * configured rates later never alters registered orders. The rate travels as
 * a plain number (quetzales with at most two decimals); formatting to the
 * canonical 2-decimal string happens at the call sites.
 */
export interface ShippingRates {
  /** Quetzal rate for the delivery department's name. */
  rateForDepartment(departmentName: string): number;
}

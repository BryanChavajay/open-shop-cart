import type { ShippingRates } from "../../../domain/checkout/interfaces/shipping-rates.js";
import { DefaultShippingRates } from "../../../infrastructure/shipping/default-shipping-rates.js";

/** Satisfies the ShippingRates port structurally with flat configured rates. */
export function createDefaultShippingRates(
  capitalRate: number,
  departmentsRate: number,
): ShippingRates {
  const impl = new DefaultShippingRates(capitalRate, departmentsRate);
  return {
    rateForDepartment: (departmentName: string) => impl.rateForDepartment(departmentName),
  };
}

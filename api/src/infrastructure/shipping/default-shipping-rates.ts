/** Flat rates: one for the Guatemala department, one for the rest of the country. */
export class DefaultShippingRates {
  private static readonly CAPITAL_DEPARTMENT = "guatemala";

  constructor(
    private readonly capitalRate: number,
    private readonly departmentsRate: number,
  ) {
    if (capitalRate < 0 || departmentsRate < 0) {
      throw new Error("The shipping rates cannot be negative");
    }
  }

  rateForDepartment(departmentName: string): number {
    const normalized = departmentName.trim().toLowerCase();
    return normalized === DefaultShippingRates.CAPITAL_DEPARTMENT
      ? this.capitalRate
      : this.departmentsRate;
  }
}

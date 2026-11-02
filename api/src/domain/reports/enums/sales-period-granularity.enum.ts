/** Granularity used to bucket sales into periods in the RF-08 sales report. */
export enum SalesPeriodGranularity {
  /** One bucket per calendar day (local calendar date). */
  DAY = "DAY",
  /** One bucket per ISO week, starting on Monday. */
  WEEK = "WEEK",
  /** One bucket per calendar month. */
  MONTH = "MONTH",
}

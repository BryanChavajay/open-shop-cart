/** One category row of the RF-08 sales-by-category report. */
export interface SalesByCategoryItemReadModel {
  /** Public identifier (UUID) of the category. */
  categoryPublicId: string;
  /** Display name of the category. */
  categoryName: string;
  /** Number of distinct delivered + paid orders containing the category. */
  ordersCount: number;
  /** Total units sold of the category, net of returned units. */
  unitsSold: number;
  /** Effective sales amount of the category, net of returns. */
  salesAmount: number;
  /** Amount returned to customers for the category. */
  returnedAmount: number;
}

/** One product row of the RF-08 top-selling products report. */
export interface TopSellingProductItemReadModel {
  /** Public identifier (UUID) of the product. */
  productPublicId: string;
  /** Display name of the product. */
  productName: string;
  /** Public identifier (UUID) of the product's category. */
  categoryPublicId: string;
  /** Display name of the product's category. */
  categoryName: string;
  /** Total units sold of the product, net of returned units. */
  unitsSold: number;
  /** Effective sales amount of the product, net of returns. */
  salesAmount: number;
  /** Number of distinct delivered + paid orders containing the product. */
  ordersCount: number;
}

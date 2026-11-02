/** One row of the paginated inventory list. */
export interface InventoryListItemReadModel {
  /** Public identifier (UUID v7) of the variant. */
  variantPublicId: string;
  /** Unique SKU of the variant. */
  sku: string;
  /** Name of the owning product. */
  productName: string;
  /** Whether the variant is active. */
  isActive: boolean;
  /** Whether the variant was logically deleted. */
  isDeleted: boolean;
  /** Physical stock units owned by the inventory module. */
  physicalQuantity: number;
  /** Units held by ACTIVE reservations not expired at the evaluation instant. */
  reservedQuantity: number;
  /** Physical quantity minus reserved quantity. */
  availableQuantity: number;
  /** Last physical stock update, ISO instant (UTC). */
  updatedAt: string;
}

import type {
  InventoryListFilter,
  InventoryReadRepository,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";
import type { PaginatedReadModel } from "../../domain/shared/readmodels/paginated.read-model.js";
import type { InventoryListItemReadModel } from "../../domain/inventory/readmodels/inventory-list-item.read-model.js";

export type ListInventoryQuery = InventoryListFilter;

/** Paginated listing of the inventory balances matching the filters. */
export class ListInventory {
  constructor(private readonly reads: InventoryReadRepository) {}

  async execute(
    query: ListInventoryQuery,
  ): Promise<PaginatedReadModel<InventoryListItemReadModel>> {
    return await this.reads.listInventory(query);
  }
}

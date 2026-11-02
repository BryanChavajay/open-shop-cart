import type {
  AddressReadRepository,
  AddressReadModel,
} from "../../domain/addresses/interfaces/repositories/address.repository.js";
import type { PaginatedReadModel } from "../../domain/shared/readmodels/paginated.read-model.js";

export interface ListOwnAddressesQuery {
  customerId: number;
  page: number;
  pageSize: number;
}

/** Lists the customer's own non-deleted addresses, most recent first. */
export class ListOwnAddresses {
  constructor(private readonly reads: AddressReadRepository) {}

  async execute(
    query: ListOwnAddressesQuery,
  ): Promise<PaginatedReadModel<AddressReadModel>> {
    return this.reads.listOwnAddresses(
      query.customerId,
      query.page,
      query.pageSize,
    );
  }
}

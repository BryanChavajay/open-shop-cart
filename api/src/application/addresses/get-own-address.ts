import type {
  AddressReadRepository,
  AddressReadModel,
} from "../../domain/addresses/interfaces/repositories/address.repository.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface OwnAddressQuery {
  /** Owning customer, taken from the guarded identity, never from the URL. */
  customerId: number;
  addressPublicId: string;
}

/**
 * Reads one owned address. The repository applies ownership inside the SQL
 * predicate, so an unknown or foreign address raises the same
 * NotFoundError/ADDRESS_NOT_FOUND (404): a customer never learns whether a
 * foreign address exists.
 */
export class GetOwnAddress {
  constructor(private readonly reads: AddressReadRepository) {}

  async execute(query: OwnAddressQuery): Promise<AddressReadModel> {
    const detail = await this.reads.findOwnDetailByPublicId(
      query.customerId,
      query.addressPublicId,
    );
    if (detail === null) {
      throw new NotFoundError(
        "Address not found",
        ErrorCode.ADDRESS_NOT_FOUND,
        undefined,
        undefined,
      );
    }
    return detail;
  }
}

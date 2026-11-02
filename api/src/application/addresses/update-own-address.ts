import { Address } from "../../domain/addresses/entities/address.entity.js";
import type {
  AddressReadRepository,
  AddressWriteRepository,
  AddressReadModel,
} from "../../domain/addresses/interfaces/repositories/address.repository.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";

export interface UpdateOwnAddressCommand {
  customerId: number;
  addressPublicId: string;
  recipientFirstName: string;
  recipientLastName: string;
  phone: string;
  municipalityPublicId: string;
  exactAddress: string;
  reference: string;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

/**
 * Replaces the editable fields of an owned address. The entity validates and
 * normalizes the fields (trimmed texts, 8-digit phone) before the write, the
 * procedure re-validates ownership (unknown/foreign = ADDRESS_NOT_FOUND) and
 * the execution joins the caller's transaction when requested.
 */
export class UpdateOwnAddress {
  constructor(
    private readonly reads: AddressReadRepository,
    private readonly writes: AddressWriteRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: UpdateOwnAddressCommand): Promise<AddressReadModel> {
    // Ownership is re-checked before the locked write so a foreign address
    // never reaches the modification path.
    const existing = await this.reads.findOwnDetailByPublicId(
      command.customerId,
      command.addressPublicId,
    );
    if (existing === null) {
      throw new NotFoundError(
        "Address not found",
        ErrorCode.ADDRESS_NOT_FOUND,
        undefined,
        undefined,
      );
    }
    const fields = Address.prepareFields({
      publicId: command.addressPublicId,
      municipalityPublicId: command.municipalityPublicId,
      recipientFirstName: command.recipientFirstName,
      recipientLastName: command.recipientLastName,
      phone: command.phone,
      exactAddress: command.exactAddress,
      reference: command.reference,
    });
    const scope: TransactionScope<AddressReadModel> = async (exec) =>
      this.writes.updateAddress(exec, {
        customerId: command.customerId,
        addressPublicId: command.addressPublicId,
        ...fields,
      });
    return runOrJoin(command.joinExecutor ?? null, this.unitOfWork, scope);
  }
}

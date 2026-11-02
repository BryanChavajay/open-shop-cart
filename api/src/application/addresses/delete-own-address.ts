import type { AddressWriteRepository } from "../../domain/addresses/interfaces/repositories/address.repository.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";

export interface DeleteOwnAddressCommand {
  customerId: number;
  addressPublicId: string;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

/**
 * Logical delete of an owned, non-deleted address. Unknown or foreign
 * addresses surface as NotFoundError/ADDRESS_NOT_FOUND from the persistence
 * (ownership lives in the procedure), indistinguishable for the requester.
 */
export class DeleteOwnAddress {
  constructor(
    private readonly writes: AddressWriteRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: DeleteOwnAddressCommand): Promise<void> {
    const scope: TransactionScope<void> = async (exec) =>
      this.writes.softDeleteAddress(
        exec,
        command.customerId,
        command.addressPublicId,
      );
    return runOrJoin(command.joinExecutor ?? null, this.unitOfWork, scope);
  }
}

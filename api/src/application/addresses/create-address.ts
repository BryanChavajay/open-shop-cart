import { Address } from "../../domain/addresses/entities/address.entity.js";
import type { AddressInput } from "../../domain/addresses/entities/address.entity.js";
import type {
  AddressReadRepository,
  AddressWriteRepository,
  AddressReadModel,
} from "../../domain/addresses/interfaces/repositories/address.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";
import type { CommandExecutor } from "../../domain/shared/interfaces/providers/sql-executor.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork, TransactionScope } from "../shared/unit-of-work.js";
import { runOrJoin } from "../shared/unit-of-work.js";

export interface CreateAddressCommand extends Omit<AddressInput, "publicId"> {
  /** Owning customer, taken from the guarded identity, never from input. */
  customerId: number;
  /** Executor of an already open transaction to join instead of opening one. */
  joinExecutor?: CommandExecutor | null | undefined;
}

/**
 * Registers a delivery address for a customer: the entity validates and
 * normalizes (trimmed texts, 8-digit phone), the write stores it inside a
 * transaction (its own, or the caller's via joinExecutor) and the detail is
 * re-read for the joined municipality/department names.
 */
export class CreateAddress {
  constructor(
    private readonly reads: AddressReadRepository,
    private readonly writes: AddressWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateAddressCommand): Promise<AddressReadModel> {
    const registeredAt = this.clock.now().toISOString();
    const scope: TransactionScope<string> = async (exec) => {
      const address = Address.create(
        command.customerId,
        {
          publicId: this.identifiers.newPublicId(),
          municipalityPublicId: command.municipalityPublicId,
          recipientFirstName: command.recipientFirstName,
          recipientLastName: command.recipientLastName,
          phone: command.phone,
          exactAddress: command.exactAddress,
          reference: command.reference,
        },
        registeredAt,
      );
      const snapshot = await this.writes.insertAddress(exec, address);
      return snapshot.publicId;
    };
    const publicId = await runOrJoin(
      command.joinExecutor ?? null,
      this.unitOfWork,
      scope,
    );
    const detail = await this.reads.findOwnDetailByPublicId(
      command.customerId,
      publicId,
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

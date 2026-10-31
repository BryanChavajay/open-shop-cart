import type { UserActor } from "./dependencies.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { UserCache } from "../../domain/users/interfaces/cache/user-cache.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface ActivateUserCommand {
  actor: UserActor;
  publicId: string;
}
export class ActivateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly cache: UserCache,
  ) {}
  async execute(command: ActivateUserCommand): Promise<void> {
    if (command.actor.publicId === command.publicId)
      throw new BusinessRuleViolation(
        "Operación sobre sí mismo no permitida",
        ErrorCode.SELF_OPERATION_NOT_ALLOWED,
        undefined,
        undefined,
      );

    const user = await this.users.findByPublicId(command.publicId);

    if (!user || user.isDeleted)
      throw new NotFoundError(
        "Usuario no encontrado",
        ErrorCode.USER_NOT_FOUND,
        undefined,
        undefined,
      );
    user.activate(this.identifiers.newSessionVersion());

    await this.users.update(user);

    try {
      await this.cache.delete(user.publicId);
    } catch (error) {
      console.error("[ActivateUser] Cache deletion failed", error);
    }
  }
}

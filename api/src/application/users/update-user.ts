import { User } from "../../domain/users/entities/user.entity.js";
import { Role } from "../../domain/users/enums/role.enum.js";
import type { UserActor } from "./dependencies.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { UserCache } from "../../domain/users/interfaces/cache/user-cache.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface UpdateUserCommand {
  actor: UserActor;
  publicId: string;
  firstName?: string | undefined;
  lastName?: string | null | undefined;
  email?: string | undefined;
  role?: Role | undefined;
}
export class UpdateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly cache: UserCache,
  ) {}
  async execute(command: UpdateUserCommand): Promise<void> {
    const user = await this.users.findByPublicId(command.publicId);

    if (!user || user.isDeleted)
      throw new NotFoundError(
        "Usuario no encontrado",
        ErrorCode.USER_NOT_FOUND,
        undefined,
        undefined,
      );

    if (!user.isInternalStaff())
      throw new BusinessRuleViolation(
        "La gestión directa de clientes no está permitida",
        ErrorCode.CLIENT_MANAGEMENT_NOT_ALLOWED,
        undefined,
        undefined,
      );

    if (command.role !== undefined && command.actor.publicId === user.publicId)
      throw new BusinessRuleViolation(
        "No puedes cambiar tu propio rol",
        ErrorCode.SELF_OPERATION_NOT_ALLOWED,
        undefined,
        undefined,
      );

    if (
      user.role === Role.ADMINISTRADOR &&
      user.isActive &&
      command.role !== undefined &&
      command.role !== Role.ADMINISTRADOR &&
      (await this.users.count({
        role: Role.ADMINISTRADOR,
        isActive: true,
        isDeleted: false,
      })) <= 1
    )
      throw new ConflictError(
        "Debe permanecer un administrador activo",
        ErrorCode.LAST_ACTIVE_ADMINISTRATOR,
        undefined,
        undefined,
      );

    if (command.email !== undefined) {
      const existing = await this.users.findByEmail(
        User.normalizeEmail(command.email),
      );
      if (existing && existing.publicId !== user.publicId)
        throw new ConflictError(
          "El correo ya está registrado",
          ErrorCode.EMAIL_ALREADY_REGISTERED,
          undefined,
          undefined,
        );
    }

    const previousVersion = user.sessionVersion;

    const next = this.identifiers.newSessionVersion();

    if (command.firstName !== undefined || command.lastName !== undefined)
      user.updateName(
        command.firstName ?? user.firstName,
        command.lastName === undefined ? user.lastName : command.lastName,
        next,
      );

    if (command.email !== undefined) user.changeEmail(command.email, next);

    if (command.role !== undefined) user.changeRole(command.role, next);

    if (user.sessionVersion === previousVersion) return;

    await this.users.update(user);

    try {
      await this.cache.delete(user.publicId);
    } catch (error) {
      console.error("[UpdateUser] Cache deletion failed", error);
    }
  }
}

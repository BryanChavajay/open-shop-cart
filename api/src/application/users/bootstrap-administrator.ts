import { User } from "../../domain/users/entities/user.entity.js";
import { Role } from "../../domain/users/enums/role.enum.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { PasswordHasher } from "../../domain/shared/interfaces/providers/password-hasher.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface BootstrapAdministratorCommand {
  firstName: string;
  lastName: string | null;
  email: string;
  password: string;
}
export class BootstrapAdministrator {
  constructor(
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly passwordHasher: PasswordHasher,
  ) {}
  async execute(
    command: BootstrapAdministratorCommand,
  ): Promise<{ created: boolean }> {
    if (
      (await this.users.count({
        role: Role.ADMINISTRADOR,
        isActive: true,
        isDeleted: false,
      })) > 0
    )
      return { created: false };
    User.validatePassword(command.password);

    if (await this.users.findByEmail(User.normalizeEmail(command.email)))
      throw new ConflictError(
        "El correo ya está registrado",
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        undefined,
        undefined,
      );

    const user = User.createInternal({
      ...command,
      role: Role.ADMINISTRADOR,
      publicId: this.identifiers.newPublicId(),
      passwordHash: await this.passwordHasher.hash(command.password),
      sessionVersion: this.identifiers.newSessionVersion(),
    });

    await this.users.save(user);

    return { created: true };
  }
}

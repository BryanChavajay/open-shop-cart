import { User } from "../../domain/users/entities/user.entity.js";
import { Role } from "../../domain/users/enums/role.enum.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { PasswordHasher } from "../../domain/shared/interfaces/providers/password-hasher.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface CreateUserCommand {
  firstName: string;
  lastName: string | null;
  email: string;
  password: string;
  role: Role;
}
export class CreateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly passwordHasher: PasswordHasher,
  ) {}
  async execute(command: CreateUserCommand): Promise<{ publicId: string }> {
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
      publicId: this.identifiers.newPublicId(),
      passwordHash: await this.passwordHasher.hash(command.password),
      sessionVersion: this.identifiers.newSessionVersion(),
    });

    await this.users.save(user);

    return { publicId: user.publicId };
  }
}

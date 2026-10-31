import { User } from "../../domain/users/entities/user.entity.js";
import type { UserActor } from "./dependencies.js";
import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { UserCache } from "../../domain/users/interfaces/cache/user-cache.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { PasswordHasher } from "../../domain/shared/interfaces/providers/password-hasher.js";
import { UnauthorizedError } from "../../domain/shared/errors/unauthorized.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface UpdateOwnProfileCommand {
  actor: UserActor;
  firstName?: string | undefined;
  lastName?: string | null | undefined;
  email?: string | undefined;
  password?: string | undefined;
}

export class UpdateOwnProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly cache: UserCache,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(command: UpdateOwnProfileCommand): Promise<void> {
    const user = await this.users.findByPublicId(command.actor.publicId);
    if (!user || user.id === null || !user.canAuthenticate())
      throw new UnauthorizedError(
        "La sesión no es válida",
        ErrorCode.SESSION_INVALID,
        undefined,
        undefined,
      );

    const email =
      command.email === undefined
        ? user.email
        : User.normalizeEmail(command.email);

    if (email !== user.email && (await this.users.findByEmail(email)))
      throw new ConflictError(
        "El correo ya está registrado",
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        undefined,
        undefined,
      );

    let passwordHash: string | undefined;

    if (command.password !== undefined) {
      User.validatePassword(command.password);
      passwordHash = await this.passwordHasher.hash(command.password);
    }

    const hasName =
      command.firstName !== undefined || command.lastName !== undefined;

    if (!hasName && email === user.email && passwordHash === undefined) return;

    const nextSessionVersion = this.identifiers.newSessionVersion();

    if (hasName)
      user.updateName(
        command.firstName ?? user.firstName,
        command.lastName === undefined ? user.lastName : command.lastName,
        nextSessionVersion,
      );

    if (email !== user.email) user.changeEmail(email, nextSessionVersion);

    if (passwordHash !== undefined)
      user.replacePasswordHash(passwordHash, nextSessionVersion);

    await this.users.update(user);
    try {
      await this.cache.delete(user.publicId);
    } catch (error) {
      console.error("[UpdateOwnProfile] Cache deletion failed", error);
    }
  }
}

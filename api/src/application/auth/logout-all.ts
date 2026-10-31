import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import type { UserCache } from "../../domain/users/interfaces/cache/user-cache.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { UnauthorizedError } from "../../domain/shared/errors/unauthorized.js";

export interface LogoutAllCommand {
  publicId: string;
  sessionVersion: string;
}
export class LogoutAll {
  constructor(
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly cache: UserCache,
  ) {}
  async execute(command: LogoutAllCommand): Promise<void> {
    const user = await this.users.findByPublicId(command.publicId);

    if (
      !user ||
      !user.canAuthenticate() ||
      user.sessionVersion !== command.sessionVersion
    )
      throw new UnauthorizedError(
        "La sesión no es válida",
        ErrorCode.SESSION_INVALID,
        undefined,
        undefined,
      );

    user.revokeSessions(this.identifiers.newSessionVersion());

    await this.users.update(user);

    try {
      await this.cache.delete(user.publicId);
    } catch (error) {
      console.error("[LogoutAll] Cache deletion failed", error);
    }
  }
}

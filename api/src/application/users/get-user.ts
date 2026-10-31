import type { UserRepository } from "../../domain/users/interfaces/repositories/user.repository.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface GetUserQuery {
  publicId: string;
}
export class GetUser {
  constructor(private readonly users: UserRepository) {}
  async execute(query: GetUserQuery) {
    const user = await this.users.findDetail(query.publicId);

    if (!user || user.isDeleted)
      throw new NotFoundError(
        "Usuario no encontrado",
        ErrorCode.USER_NOT_FOUND,
        undefined,
        undefined,
      );

    return user;
  }
}

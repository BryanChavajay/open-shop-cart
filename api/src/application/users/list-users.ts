import type {
  ListUsersFilter,
  UserRepository,
} from "../../domain/users/interfaces/repositories/user.repository.js";
import { User } from "../../domain/users/entities/user.entity.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface ListUsersQuery extends Omit<ListUsersFilter, "isDeleted"> {}

export class ListUsers {
  constructor(private readonly users: UserRepository) {}

  async execute(query: ListUsersQuery) {
    if (
      !Number.isSafeInteger(query.page) ||
      query.page < 1 ||
      !Number.isSafeInteger(query.pageSize) ||
      query.pageSize < 1 ||
      query.pageSize > 100
    )
      throw new BusinessRuleViolation(
        "Paginación inválida",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );

    const email =
      query.email === undefined
        ? undefined
        : User.normalizeEmail(query.email) || undefined;

    return this.users.list({
      email,
      page: query.page,
      pageSize: query.pageSize,
      isDeleted: false,
    });
  }
}

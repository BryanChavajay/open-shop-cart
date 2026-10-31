import type { User } from "../../entities/user.entity.js";
import type { CurrentUserReadModel } from "../../readmodels/current-user.read-model.js";
import type { PaginatedReadModel } from "../../../shared/readmodels/paginated.read-model.js";
import type { UserDetailReadModel } from "../../readmodels/user-detail.read-model.js";
import type { UserListItemReadModel } from "../../readmodels/user-list-item.read-model.js";
import type { Role } from "../../enums/role.enum.js";

export interface ListUsersFilter {
  /** Coincidencia parcial sobre el correo normalizado. */
  email: string | undefined;
  page: number;
  pageSize: number;
  isDeleted: boolean;
}

/**
 * Acceso a la entidad User. Las implementaciones usan stored procedures.
 * Los métodos de escritura reciben la entidad ya modificada por sus métodos de dominio.
 */
export interface UserRepository {
  /** Inserts a new user and returns the assigned persistence identifier. */
  save(user: User): Promise<User>;
  /** Updates an existing user; never inserts a missing record. */
  update(user: User): Promise<User>;
  count(filter: { role: Role; isActive: boolean; isDeleted: boolean }): Promise<number>;
  /** Busca un usuario por identificador público, incluidos eliminados. */
  findByPublicId(publicId: string): Promise<User | null>;
  /** Busca por correo normalizado, incluidos eliminados. */
  findByEmail(email: string): Promise<User | null>;
  /** Información del usuario autenticado (sin validar estado; eso lo decide el caso de uso). */
  findCurrentUser(publicId: string): Promise<CurrentUserReadModel | null>;
  findDetail(publicId: string): Promise<UserDetailReadModel | null>;
  list(filter: ListUsersFilter): Promise<PaginatedReadModel<UserListItemReadModel>>;
}

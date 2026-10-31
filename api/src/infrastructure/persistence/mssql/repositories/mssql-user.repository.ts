import sql from "mssql";
import { User, type UserSnapshot } from "../../../../domain/users/entities/user.entity.js";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import type { CurrentUserReadModel } from "../../../../domain/users/readmodels/current-user.read-model.js";
import type { PaginatedReadModel } from "../../../../domain/shared/readmodels/paginated.read-model.js";
import type { UserDetailReadModel } from "../../../../domain/users/readmodels/user-detail.read-model.js";
import type { UserListItemReadModel } from "../../../../domain/users/readmodels/user-list-item.read-model.js";
import type {
  ListUsersFilter,
  UserRepository,
} from "../../../../domain/users/interfaces/repositories/user.repository.js";
import {
  firstRow,
  parseEnum,
  readBoolean,
  readNullableString,
  readNumber,
  readString,
  readUuid,
} from "../mssql-helpers.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";

const PROCEDURES = {
  findByPublicId: "SP_Usuarios_BuscarPorIdentificadorPublico",
  findByEmail: "SP_Usuarios_BuscarPorCorreo",
  findCurrentUser: "SP_Usuarios_ObtenerActual",
  findDetail: "SP_Usuarios_ObtenerDetalle",
  list: "SP_Usuarios_Listar",
} as const;

const EMAIL_MAX_LENGTH = 254;
const LIKE_ESCAPE_CHAR = "\\";

function toUserSnapshot(row: SqlRow): UserSnapshot {
  return {
    id: readNumber(row, "IDUsuario"),
    publicId: readUuid(row, "IDPublico"),
    firstName: readString(row, "Nombres"),
    lastName: readNullableString(row, "Apellidos"),
    email: readString(row, "Correo"),
    passwordHash: readString(row, "ContrasenaHash"),
    role: parseEnum(Role, readString(row, "Rol"), "Rol"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
    sessionVersion: readUuid(row, "VersionSesion"),
  };
}

function toCurrentUser(row: SqlRow): CurrentUserReadModel {
  return {
    id: readNumber(row, "IDUsuario"),
    publicId: readUuid(row, "IDPublico"),
    firstName: readString(row, "Nombres"),
    lastName: readNullableString(row, "Apellidos"),
    email: readString(row, "Correo"),
    role: parseEnum(Role, readString(row, "Rol"), "Rol"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
    sessionVersion: readUuid(row, "VersionSesion"),
  };
}

function toUserDetail(row: SqlRow): UserDetailReadModel {
  return {
    publicId: readUuid(row, "IDPublico"),
    firstName: readString(row, "Nombres"),
    lastName: readNullableString(row, "Apellidos"),
    email: readString(row, "Correo"),
    role: parseEnum(Role, readString(row, "Rol"), "Rol"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
  };
}

function toUserListItem(row: SqlRow): UserListItemReadModel {
  return {
    publicId: readUuid(row, "IDPublico"),
    firstName: readString(row, "Nombres"),
    lastName: readNullableString(row, "Apellidos"),
    email: readString(row, "Correo"),
    role: parseEnum(Role, readString(row, "Rol"), "Rol"),
    isActive: readBoolean(row, "Activo"),
  };
}

/** Builds a LIKE pattern for partial matches. Escapes wildcards so user input is matched literally. */
function toLikePattern(email: string | undefined): string | null {
  if (email === undefined) {
    return null;
  }
  return email.replace(/[\\%_[]/g, (char) => `${LIKE_ESCAPE_CHAR}${char}`);
}

export class MssqlUserRepository implements UserRepository {
  constructor(private readonly executor: SqlExecutor) {}

  async save(user: User): Promise<User> {
    const result = await this.executor.execute("SP_Usuarios_Guardar", [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: user.publicId },
      { name: "Nombres", type: sql.NVarChar(100), value: user.firstName },
      { name: "Apellidos", type: sql.NVarChar(100), value: user.lastName },
      { name: "Correo", type: sql.NVarChar(254), value: user.email },
      { name: "ContrasenaHash", type: sql.NVarChar(255), value: user.passwordHash },
      { name: "Rol", type: sql.NVarChar(20), value: user.role },
      { name: "Activo", type: sql.Bit, value: user.isActive },
      { name: "Eliminado", type: sql.Bit, value: user.isDeleted },
      { name: "VersionSesion", type: sql.UniqueIdentifier, value: user.sessionVersion },
    ]);
    const row = firstRow(result.recordset);
    if (!row) throw new Error("User write returned no row");
    return User.restore(toUserSnapshot(row));
  }

  async update(user: User): Promise<User> {
    const result = await this.executor.execute("SP_Usuarios_Actualizar", [
      { name: "IDUsuario", type: sql.Int, value: user.id },
      { name: "IDPublico", type: sql.UniqueIdentifier, value: user.publicId },
      { name: "Nombres", type: sql.NVarChar(100), value: user.firstName },
      { name: "Apellidos", type: sql.NVarChar(100), value: user.lastName },
      { name: "Correo", type: sql.NVarChar(254), value: user.email },
      { name: "ContrasenaHash", type: sql.NVarChar(255), value: user.passwordHash },
      { name: "Rol", type: sql.NVarChar(20), value: user.role },
      { name: "Activo", type: sql.Bit, value: user.isActive },
      { name: "Eliminado", type: sql.Bit, value: user.isDeleted },
      { name: "VersionSesion", type: sql.UniqueIdentifier, value: user.sessionVersion },
    ]);
    const row = firstRow(result.recordset);
    if (!row) throw new Error("User update returned no row");
    return User.restore(toUserSnapshot(row));
  }

  async count(filter: { role: Role; isActive: boolean; isDeleted: boolean }): Promise<number> {
    const result = await this.executor.execute("SP_Usuarios_Contar", [
      { name: "Rol", type: sql.NVarChar(20), value: filter.role },
      { name: "Activo", type: sql.Bit, value: filter.isActive },
      { name: "Eliminado", type: sql.Bit, value: filter.isDeleted },
    ]);
    const row = firstRow(result.recordset);
    return row ? readNumber(row, "TotalFilas") : 0;
  }

  async findByPublicId(publicId: string): Promise<User | null> {
    const result = await this.executor.execute(PROCEDURES.findByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : User.restore(toUserSnapshot(row));
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.executor.execute(PROCEDURES.findByEmail, [
      {
        name: "Correo",
        type: sql.NVarChar(EMAIL_MAX_LENGTH),
        value: email,
      },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : User.restore(toUserSnapshot(row));
  }

  async findCurrentUser(publicId: string): Promise<CurrentUserReadModel | null> {
    const result = await this.executor.execute(PROCEDURES.findCurrentUser, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toCurrentUser(row);
  }

  async findDetail(publicId: string): Promise<UserDetailReadModel | null> {
    const result = await this.executor.execute(PROCEDURES.findDetail, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toUserDetail(row);
  }

  async list(filter: ListUsersFilter): Promise<PaginatedReadModel<UserListItemReadModel>> {
    // El procedimiento devuelve dos conjuntos: [0] total de coincidencias, [1] página solicitada.
    const result = await this.executor.execute(PROCEDURES.list, [
      {
        name: "Correo",
        type: sql.NVarChar(EMAIL_MAX_LENGTH),
        value: toLikePattern(filter.email),
      },
      { name: "Pagina", type: sql.Int, value: filter.page },
      { name: "TamanoPagina", type: sql.Int, value: filter.pageSize },
      { name: "Eliminado", type: sql.Bit, value: filter.isDeleted },
    ]);

    const countRow = firstRow(result.recordsets[0]);
    const totalItems = countRow === null ? 0 : readNumber(countRow, "TotalFilas");
    const items = (result.recordsets[1] ?? []).map(toUserListItem);

    return {
      items,
      page: filter.page,
      pageSize: filter.pageSize,
      totalItems,
      totalPages: filter.pageSize > 0 ? Math.ceil(totalItems / filter.pageSize) : 0,
    };
  }
}

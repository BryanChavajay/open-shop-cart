import type { Role } from "../enums/role.enum.js";

/** Detalle de un usuario consultado por el administrador o por el propio titular. */
export interface UserDetailReadModel {
  publicId: string;
  firstName: string;
  lastName: string | null;
  email: string;
  role: Role;
  isActive: boolean;
  isDeleted: boolean;
}

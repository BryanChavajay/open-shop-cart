import type { Role } from "../enums/role.enum.js";

/** Elemento del listado administrativo de usuarios no eliminados. */
export interface UserListItemReadModel {
  publicId: string;
  firstName: string;
  lastName: string | null;
  email: string;
  role: Role;
  isActive: boolean;
}

import type { Role } from "../enums/role.enum.js";

/**
 * Authenticated user data, including the internal persistence identifier.
 * Does not contain the password hash.
 */
export interface CurrentUserReadModel {
  id: number;
  publicId: string;
  firstName: string;
  lastName: string | null;
  email: string;
  role: Role;
  isActive: boolean;
  isDeleted: boolean;
  sessionVersion: string;
}

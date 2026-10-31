import { z } from "zod";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import { paginatedSchema } from "../shared/paginated.schema.js";

export const roleSchema = z.enum(Role);

export const internalRoleSchema = z.enum([Role.OPERADOR, Role.ADMINISTRADOR]);

export const publicUserSchema = z.object({
  publicId: z.uuid(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  email: z.email(),
  role: roleSchema,
  isActive: z.boolean(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

export const userDetailPublicSchema = publicUserSchema.extend({
  isDeleted: z.boolean(),
});

export const createdUserPublicSchema = z.object({
  publicId: z.uuid(),
});

export const paginatedUsersPublicSchema = paginatedSchema(publicUserSchema);

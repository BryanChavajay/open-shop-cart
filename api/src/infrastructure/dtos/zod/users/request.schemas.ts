import { z } from "zod";
import { internalRoleSchema } from "./public.schemas.js";

const firstName = z.string().trim().min(1).max(100);

const lastName = z.string().trim().max(100).nullable().optional();

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .pipe(z.string().max(255));

const password = z.string().min(1).max(1024);

const profile = { firstName, lastName, email };

export const registerClientSchema = z.strictObject({ ...profile, password });

export const createInternalUserSchema = z.strictObject({
  ...profile,
  password,
  role: internalRoleSchema,
});

export const updateOwnProfileSchema = z
  .strictObject({
    firstName: firstName.optional(),
    lastName,
    email: email.optional(),
    password: password.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Debe proporcionar al menos un campo",
  );

export const updateInternalUserSchema = z
  .strictObject({
    firstName: firstName.optional(),
    lastName,
    email: email.optional(),
    role: internalRoleSchema.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Debe proporcionar al menos un campo",
  );

export const userIdParamsSchema = z.strictObject({ publicId: z.uuid() });

const positiveInteger = z.coerce.number().positive();

export const listUsersQuerySchema = z.strictObject({
  email: z.email().optional(),
  page: positiveInteger.optional().default(1),
  pageSize: positiveInteger.pipe(z.number().max(100)).optional().default(20),
});

export const setUserActiveSchema = z.strictObject({ isActive: z.boolean() });

export type RegisterClientRequest = z.infer<typeof registerClientSchema>;

export type CreateInternalUserRequest = z.infer<
  typeof createInternalUserSchema
>;

export type UpdateOwnProfileRequest = z.infer<typeof updateOwnProfileSchema>;

export type UpdateInternalUserRequest = z.infer<
  typeof updateInternalUserSchema
>;

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .pipe(z.string().max(255));

const token = z.string().min(1).max(4096);

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(1024),
});

export const requestPasswordRecoverySchema = z.strictObject({ email });

export const confirmAccountSchema = z.strictObject({ token });

export const resetPasswordSchema = z.strictObject({
  token,
  password: z.string().min(1).max(1024),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export type RequestPasswordRecoveryRequest = z.infer<
  typeof requestPasswordRecoverySchema
>;

export type ConfirmAccountRequest = z.infer<typeof confirmAccountSchema>;

export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

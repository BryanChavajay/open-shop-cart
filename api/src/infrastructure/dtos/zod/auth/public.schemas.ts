import { z } from "zod";

export const authPublicSchema = z.object({
  access_token: z.string(),
  type: z.literal("Bearer"),
  expiresAt: z.iso.datetime(),
});

export type AuthPublic = z.infer<typeof authPublicSchema>;

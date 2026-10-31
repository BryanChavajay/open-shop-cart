import { z } from "zod";

const base64Of32Bytes = (value: string): boolean =>
  Buffer.from(value, "base64").length === 32;

const envSchema = z.object({
  // API settings
  API_V1_STR: z.string().default("/api/v1"),
  ENVIRONMENT: z.enum(["local", "staging", "production"]).default("local"),
  // Controls account confirmation at registration and email-based password recovery.
  EMAIL_SERVICE_ENABLED: z.enum(["true", "false"]).default("true").transform(value => value === "true"),

  // JWT settings
  ACCESS_TOKEN_SECRET_KEY: z.string().min(32),
  REFRESH_TOKEN_SECRET_KEY: z.string().min(32),
  ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().positive().default(15),
  REFRESH_TOKEN_EXPIRE_HOURS: z.coerce.number().positive().default(168),
  JWT_ISSUER: z.string().min(1).default("openshopcart-api"),
  JWT_AUDIENCE: z.string().min(1).default("openshopcart-web"),

  // CORS settings
  FRONTEND_HOST: z.url(),
  BACKEND_CORS_ORIGINS: z
    .string()
    .transform((val) => val.split(",").map((url) => url.trim()))
    .pipe(z.array(z.url())),

  // MSSQL
  MSSQL_SERVER: z.string().min(1),
  MSSQL_PORT: z.coerce.number().positive().default(4563),
  MSSQL_USER: z.string().min(1),
  MSSQL_PASSWORD: z.string().min(7),
  MSSQL_DB: z.string().min(1),

  // Cache (Valkey), e.g. valkey://host:port or valkeys://host:port for TLS
  VAL_KEY_URL: z.string(),
  CURRENT_USER_CACHE_TTL_SECONDS: z.coerce.number().positive().default(60),

  // Email (Gmail SMTP with an application password)
  GMAIL_USER: z.email(),
  GMAIL_APP_PASSWORD: z.string().min(1),
  MAIL_FROM_NAME: z.string().min(1).default("OpenShopCart"),

  // Symmetric key (base64, 32 bytes) used to encrypt outbox payloads at rest
  OUTBOX_ENCRYPTION_KEY: z
    .string()
    .refine(base64Of32Bytes, "OUTBOX_ENCRYPTION_KEY must be base64 of 32 bytes"),

  // Initial administrator (used by the bootstrap command only)
  INITIAL_ADMIN_EMAIL: z.email().default("admin@openshopcart.local"),
  INITIAL_ADMIN_PASSWORD: z
    .string()
    .min(8)
    .default("OpenShopCart-Admin-2026!"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;

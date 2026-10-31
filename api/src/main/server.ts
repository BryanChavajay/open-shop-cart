import "dotenv/config";
import { env } from "../config.js";
import { createValkeyClient } from "../infrastructure/cache/valkey/valkey-client.js";
import {
  getMssqlPool,
  closeMssqlPool,
} from "../infrastructure/persistence/mssql/mssql-connection.js";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import cors from "cors";
import { errorHandler } from "../presentation/api/v1/middleware/error.middleware.js";
import { createV1Router } from "../presentation/api/v1/router.js";
import { createDependencies } from "./dependencies.js";

async function start(): Promise<void> {
  const pool = await getMssqlPool();

  let client: Awaited<ReturnType<typeof createValkeyClient>> | undefined;
  try {
    client = await createValkeyClient();
  } catch (error) {
    console.warn("Valkey no disponible; se continúa sin caché", error);
  }

  const dependencies = createDependencies(pool, client);

  const options = {
    secureCookies: env.ENVIRONMENT !== "local",
  };
  const allowedOrigins = [
    ...new Set([
      new URL(env.FRONTEND_HOST).origin,
      ...env.BACKEND_CORS_ORIGINS.map((origin) => new URL(origin).origin),
    ]),
  ];

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(
    env.API_V1_STR,
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    createV1Router({ ...dependencies, ...options }),
  );

  app.use(errorHandler);

  const server = app.listen(Number(process.env.PORT ?? 5000), () =>
    console.log("API iniciada"),
  );

  let stopping = false;

  let running: Promise<void> | undefined;

  const tick = () => {
    if (stopping || running) return;
    running = dependencies.outboxProcessor
      .execute({ limit: 20 })
      .then(() => {})
      .catch((error) => console.error("Error procesando outbox", error))
      .finally(() => {
        running = undefined;
      });
  };

  const timer = setInterval(tick, 10_000);

  tick();

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await running;
    client?.disconnect();
    await closeMssqlPool();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void shutdown().then(
        () => process.exit(0),
        (error) => {
          console.error(error);
          process.exit(1);
        },
      );
    });
}

start().catch(async (error) => {
  console.error("No se pudo iniciar la API", error);
  await closeMssqlPool();
  process.exitCode = 1;
});

import sql from "mssql";
import type { ConnectionPool, config as SqlConfig } from "mssql";
import { env } from "../../../config.js";

const LOCAL_ENVIRONMENT: typeof env.ENVIRONMENT = "local";
const POOL_MAX_CONNECTIONS = 10;
const POOL_IDLE_TIMEOUT_MS = 30_000;

let poolPromise: Promise<ConnectionPool> | undefined;

function buildConfig(): SqlConfig {
  const isLocal = env.ENVIRONMENT === LOCAL_ENVIRONMENT;
  return {
    server: env.MSSQL_SERVER,
    port: env.MSSQL_PORT,
    user: env.MSSQL_USER,
    password: env.MSSQL_PASSWORD,
    database: env.MSSQL_DB,
    options: {
      encrypt: true,
      // Local development usa certificados autofirmados.
      trustServerCertificate: isLocal,
      useUTC: true,
    },
    pool: {
      max: POOL_MAX_CONNECTIONS,
      min: 0,
      idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    },
  };
}

async function connect(): Promise<ConnectionPool> {
  const pool = new sql.ConnectionPool(buildConfig());
  pool.on("error", (error: unknown) => {
    // El pool reintenta las conexiones inactivas; solo se registra el fallo.
    console.error("Error en el pool de MSSQL", error);
  });
  try {
    return await pool.connect();
  } catch (error: unknown) {
    // Permite reintentar en la siguiente llamada en lugar de cachear un fallo.
    poolPromise = undefined;
    throw error;
  }
}

/** Devuelve el pool compartido de la aplicación, creándolo en la primera llamada. */
export function getMssqlPool(): Promise<ConnectionPool> {
  poolPromise ??= connect();
  return poolPromise;
}

/** Cierra el pool compartido si existe. Pensado para el apagado de la aplicación y los scripts. */
export async function closeMssqlPool(): Promise<void> {
  const current = poolPromise;
  poolPromise = undefined;
  if (current === undefined) {
    return;
  }
  const pool = await current.catch(() => undefined);
  await pool?.close();
}

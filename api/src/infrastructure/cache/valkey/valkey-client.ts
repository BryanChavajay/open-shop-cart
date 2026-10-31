import { Redis } from "ioredis";
import { env } from "../../../config.js";

const PLAIN_PROTOCOL = "valkey:";
const TLS_PROTOCOL = "valkeys:";
const DEFAULT_PORT = 6379;
const REQUEST_TIMEOUT_MS = 500;

/**
 * Creates a connected Valkey client from VAL_KEY_URL.
 * Accepts `valkey://[user:password@]host[:port]` or `valkeys://...` for TLS.
 */
export async function createValkeyClient(): Promise<Redis> {
  const url = new URL(env.VAL_KEY_URL);
  if (url.protocol !== PLAIN_PROTOCOL && url.protocol !== TLS_PROTOCOL) {
    throw new Error("VAL_KEY_URL must use the valkey:// or valkeys:// scheme");
  }

  const useTLS = url.protocol === TLS_PROTOCOL;
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const port = url.port === "" ? DEFAULT_PORT : Number(url.port);
  const credentials = buildCredentials(url);

  const client = new Redis({
    host,
    port,
    ...(useTLS ? { tls: {} } : {}),
    commandTimeout: REQUEST_TIMEOUT_MS,
    connectTimeout: REQUEST_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    ...credentials,
  });
  client.on("error", error => console.warn("Error de conexión con Valkey", error));
  try {
    await client.connect();
    return client;
  } catch (error) {
    client.disconnect();
    throw error;
  }
}

/** Extracts optional credentials embedded in the URL. */
function buildCredentials(url: URL): { password: string; username?: string } | undefined {
  if (url.password === "") {
    return undefined;
  }
  const password = decodeURIComponent(url.password);
  const username = decodeURIComponent(url.username);
  return username === "" ? { password } : { username, password };
}

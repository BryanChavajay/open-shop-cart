import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Postgrator from "postgrator";
import sql from "mssql";
import { env } from "./config.js";
import {
  closeMssqlPool,
  getMssqlPool,
} from "./infrastructure/persistence/mssql/mssql-connection.js";

const here = dirname(fileURLToPath(import.meta.url));
// Glob patterns require forward slashes, also on Windows.
const migrationPattern = join(here, "infrastructure", "migrations", "*").replaceAll("\\", "/");

const postgrator = new Postgrator({
  migrationPattern,
  driver: "mssql",
  database: env.MSSQL_DB,
  execQuery: async (query: string) => {
    const pool = await getMssqlPool();
    const result = await pool.request().query(query);
    return { rows: result.recordset ?? [] };
  },
  execSqlScript: async (script: string) => {
    const pool = await getMssqlPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Our migration format reserves standalone GO lines for batch separators.
      for (const batch of script.split(/^\s*GO\s*(?:--[^\r\n]*)?$/gmi)) {
        if (batch.trim()) await transaction.request().batch(batch);
      }
      await transaction.commit();
    } catch (error: unknown) {
      try { await transaction.rollback(); } catch { /* Preserve the original migration error. */ }
      throw error;
    }
  },
});

async function runMigrations(): Promise<void> {
  try {
    const target = process.argv[2];
    if (target !== undefined && !/^\d+$/.test(target)) throw new Error("Migration target must be a non-negative integer");
    const applied = await postgrator.migrate(target);
    const version = await postgrator.getDatabaseVersion();
    console.log(
      `Migraciones aplicadas: ${applied.length}. Versión final de la base de datos: ${version}`,
    );
  } finally {
    await closeMssqlPool();
  }
}

try {
  await runMigrations();
} catch (error: unknown) {
  console.error("Error al ejecutar las migraciones", error);
  process.exitCode = 1;
}

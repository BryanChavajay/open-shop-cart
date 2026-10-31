import { env } from "./config.js";
import { closeMssqlPool, getMssqlPool } from "./infrastructure/persistence/mssql/mssql-connection.js";
import { createDependencies } from "./main/dependencies.js";

try {
  if (env.ENVIRONMENT !== "local") throw new Error("El bootstrap solo se permite en el entorno local");
  const { users } = createDependencies(await getMssqlPool());
  const result = await users.bootstrap.execute({ firstName: "Administrador", lastName: null,
    email: env.INITIAL_ADMIN_EMAIL, password: env.INITIAL_ADMIN_PASSWORD });
  console.log(result.created ? "Administrador inicial creado" : "Ya existe un administrador activo; no se realizaron cambios");
} catch (error: unknown) {
  console.error("No se pudo ejecutar el bootstrap del administrador", error);
  process.exitCode = 1;
} finally { await closeMssqlPool(); }

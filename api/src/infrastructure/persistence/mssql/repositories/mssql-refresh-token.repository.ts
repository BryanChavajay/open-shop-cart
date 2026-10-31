import sql from "mssql";
import type { RefreshTokenRepository } from "../../../../domain/auth/interfaces/repositories/refresh-token.repository.js";
import type { SqlExecutor } from "../sql-executor.js";

export class MssqlRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly executor: SqlExecutor) {}
  async exists(jti: string): Promise<boolean> {
    const result = await this.executor.execute("SP_RefreshTokens_Buscar", [
      { name: "Jti", type: sql.UniqueIdentifier, value: jti },
    ]);
    return result.recordset.length > 0;
  }
  async save(jti: string): Promise<void> {
    await this.executor.execute("SP_RefreshTokens_Guardar", [
      { name: "Jti", type: sql.UniqueIdentifier, value: jti },
    ]);
  }
}

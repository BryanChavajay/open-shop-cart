import { DuplicateKeyError } from "../../../domain/shared/errors/duplicate-key.js";
import { isUniqueViolation } from "./mssql-helpers.js";

export function mapSqlError(error: unknown): unknown {
  return isUniqueViolation(error) ? new DuplicateKeyError() : error;
}

import { DuplicateKeyError } from "../../../domain/shared/errors/duplicate-key.js";
import { isUniqueViolation } from "./mssql-helpers.js";
import sql from "mssql";
import { ConflictError } from "../../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../../domain/shared/enums/error-code.enum.js";

const IMAGE_REFERENCE_CONSTRAINTS = [
  "FK_Productos_ImagenPortada", "FK_ProductosVariantes_ImagenPortada", "FK_ProductosVariantesImagenes_Imagen",
];

/** Número de error THROW'd por los procedimientos de inventario para clave de idempotencia duplicada. */
const DUPLICATE_OPERATION_NUMBER = 50200;

export function mapSqlError(error: unknown): unknown {
  if (isUniqueViolation(error)) return new DuplicateKeyError();
  if (error instanceof sql.RequestError && error.number === DUPLICATE_OPERATION_NUMBER) {
    return new DuplicateKeyError();
  }
  if (error instanceof sql.RequestError && error.number === 547 &&
      IMAGE_REFERENCE_CONSTRAINTS.some((name) => error.message.includes(name))) {
    return new ConflictError("The image reference changed or is still in use", ErrorCode.INVALID_CATALOG_ENTITY_STATE, undefined, undefined);
  }
  return error;
}

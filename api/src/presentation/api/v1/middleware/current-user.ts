import type { Response } from "express";
import type { CurrentUserReadModel } from "../../../../domain/users/readmodels/current-user.read-model.js";
import { Role } from "../../../../domain/users/enums/role.enum.js";
import { UnauthorizedError } from "../../../../domain/shared/errors/unauthorized.js";

function isCurrentUser(value: unknown): value is CurrentUserReadModel {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    "publicId" in value &&
    typeof value.publicId === "string" &&
    "sessionVersion" in value &&
    typeof value.sessionVersion === "string" &&
    "firstName" in value &&
    typeof value.firstName === "string" &&
    "lastName" in value &&
    (value.lastName === null || typeof value.lastName === "string") &&
    "email" in value &&
    typeof value.email === "string" &&
    "role" in value &&
    (value.role === Role.CLIENTE ||
      value.role === Role.OPERADOR ||
      value.role === Role.ADMINISTRADOR) &&
    "isActive" in value &&
    typeof value.isActive === "boolean" &&
    "isDeleted" in value &&
    typeof value.isDeleted === "boolean"
  );
}

export function currentUser(res: Response): CurrentUserReadModel {
  const value: unknown = res.locals.currentUser;
  if (!isCurrentUser(value))
    throw new UnauthorizedError(
      "Autenticación requerida",
      undefined,
      undefined,
      undefined,
    );
  return value;
}

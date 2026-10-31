import type { User } from "../../domain/users/entities/user.entity.js";
import type { CurrentUserReadModel } from "../../domain/users/readmodels/current-user.read-model.js";

export interface AuthTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthSession {
  tokens: AuthTokens;
  user: CurrentUserReadModel;
}

/** Proyecta la entidad ya cargada; evita re-leer al responder login/refresh. */
export function asCurrentUser(user: User): CurrentUserReadModel {
  const {
    id,
    publicId,
    sessionVersion,
    firstName,
    lastName,
    email,
    role,
    isActive,
    isDeleted,
  } = user;

  if (id === null) throw new Error("User is not persisted");

  return {
    id,
    publicId,
    sessionVersion,
    firstName,
    lastName,
    email,
    role,
    isActive,
    isDeleted,
  };
}

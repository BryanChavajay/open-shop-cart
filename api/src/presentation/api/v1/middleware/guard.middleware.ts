import type { RequestHandler } from "express";
import type { Role } from "../../../../domain/users/enums/role.enum.js";
import type { CurrentUserReadModel } from "../../../../domain/users/readmodels/current-user.read-model.js";
import { ErrorCode } from "../../../../domain/shared/enums/error-code.enum.js";
import { ForbiddenError } from "../../../../domain/shared/errors/forbidden-error.js";
import { UnauthorizedError } from "../../../../domain/shared/errors/unauthorized.js";
import type { TokenService } from "../../../../domain/auth/interfaces/providers/token-service.js";
import type { UserRepository } from "../../../../domain/users/interfaces/repositories/user.repository.js";
import type { UserCache } from "../../../../domain/users/interfaces/cache/user-cache.js";

export interface Identity {
  tokens: Pick<TokenService, "verifyAccessToken">;
  users: Pick<UserRepository, "findCurrentUser">;
  cache: UserCache;
}

/**
 * Autenticación y autorización en un único middleware.
 * Resuelve el usuario con cache-aside: caché primero, SQL en miss y repoblación best-effort.
 * Una invalidación de caché fallida puede servir datos stale acotados por el TTL de la caché.
 */
export function guard(identity: Identity, ...roles: Role[]): RequestHandler {
  return async (req, res, next) => {
      const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
      if (!match)
        throw new UnauthorizedError(
          "Autenticación requerida",
          undefined,
          undefined,
          undefined,
        );

      const token = await identity.tokens.verifyAccessToken(match[1]!);
      const cached = await readCache(identity, token.publicId);
      const user = cached ?? (await identity.users.findCurrentUser(token.publicId));

      if (!user || !user.isActive || user.isDeleted || user.sessionVersion !== token.sessionVersion)
        throw new UnauthorizedError(
          "La sesión no es válida",
          ErrorCode.SESSION_INVALID,
          undefined,
          undefined,
        );

      if (cached === null) await populateCache(identity, user);

      if (roles.length > 0 && !roles.includes(user.role))
        throw new ForbiddenError(
          "Acceso denegado",
          ErrorCode.ACCESS_DENIED,
          undefined,
          undefined,
        );

      res.locals.currentUser = user;
      next();
  };
}

async function readCache(identity: Identity, publicId: string): Promise<CurrentUserReadModel | null> {
  try {
    return await identity.cache.get(publicId);
  } catch (error) {
    console.error("[guard] Cache read failed; falling back to SQL", error);
    return null;
  }
}

async function populateCache(identity: Identity, user: CurrentUserReadModel): Promise<void> {
  try {
    await identity.cache.set(user);
  } catch (error) {
    console.error("[guard] Cache population failed", error);
  }
}

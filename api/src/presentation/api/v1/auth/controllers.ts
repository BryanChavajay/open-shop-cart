import type { CookieOptions, RequestHandler, Response } from "express";
import type { AuthSession } from "../../../../application/auth/dependencies.js";
import { UnauthorizedError } from "../../../../domain/shared/errors/unauthorized.js";
import * as schemas from "../../../../infrastructure/dtos/zod/auth/request.schemas.js";
import { authPublicSchema } from "../../../../infrastructure/dtos/zod/auth/public.schemas.js";
import { registerClientSchema } from "../../../../infrastructure/dtos/zod/users/request.schemas.js";
import type { RouterDependencies } from "../router.js";
import { currentUser } from "../middleware/current-user.js";

const refreshName = "refreshToken";
function refreshToken(cookies: unknown): string {
  if (
    typeof cookies === "object" &&
    cookies !== null &&
    refreshName in cookies &&
    typeof cookies[refreshName] === "string" &&
    cookies[refreshName]
  )
    return cookies[refreshName];
  throw new UnauthorizedError(
    "Autenticación requerida",
    undefined,
    undefined,
    undefined,
  );
}

function sendTokens(
  res: Response,
  session: AuthSession,
  cookie: CookieOptions,
): void {
  res.cookie(refreshName, session.tokens.refreshToken, {
    ...cookie,
    expires: session.tokens.refreshExpiresAt,
  });
  res.set("Cache-Control", "no-store").json(
    authPublicSchema.parse({
      ...session,
      access_token: session.tokens.accessToken,
      type: "Bearer",
      expiresAt: session.tokens.accessExpiresAt.toISOString(),
    }),
  );
}

export function createAuthControllers(
  deps: RouterDependencies,
): Record<
  | "register"
  | "login"
  | "refresh"
  | "logout"
  | "logoutAll"
  | "requestRecovery"
  | "resetPassword"
  | "confirmAccount",
  RequestHandler
> {
  const { auth } = deps;
  const cookie: CookieOptions = {
    httpOnly: true,
    secure: deps.secureCookies,
    sameSite: deps.secureCookies ? "none" : "lax",
    path: "/",
  };

  return {
    register: async (_req, res) => {
        const body = registerClientSchema.parse(res.locals.validated.body);
        await auth.register.execute({
          ...body,
          lastName: body.lastName ?? null,
        });
        res.status(201).end();
    },
    login: async (_req, res) => {
      sendTokens(
        res,
        await auth.login.execute(
          schemas.loginSchema.parse(res.locals.validated.body),
        ),
        cookie,
      );
    },
    refresh: async (req, res) => {
        sendTokens(
          res,
          await auth.refresh.execute({
            refreshToken: refreshToken(req.cookies),
          }),
          cookie,
        );
    },
    logout: async (req, res) => {
      try {
        await auth.logout.execute({ refreshToken: refreshToken(req.cookies) });
      } finally {
        res.clearCookie(refreshName, cookie);
      }
      res.status(204).end();
    },
    logoutAll: async (_req, res) => {
        const { publicId, sessionVersion } = currentUser(res);
        await auth.logoutAll.execute({ publicId, sessionVersion });
        res.clearCookie(refreshName, cookie);
        res.status(204).end();
    },
    requestRecovery: async (_req, res) => {
        await auth.requestPasswordRecovery.execute(
          schemas.requestPasswordRecoverySchema.parse(
            res.locals.validated.body,
          ),
        );
        res.status(204).end();
    },
    resetPassword: async (_req, res) => {
        await auth.resetPassword.execute(
          schemas.resetPasswordSchema.parse(res.locals.validated.body),
        );
        res.status(204).end();
    },
    confirmAccount: async (_req, res) => {
        await auth.confirmAccount.execute(
          schemas.confirmAccountSchema.parse(res.locals.validated.body),
        );
        res.status(204).end();
    },
  };
}

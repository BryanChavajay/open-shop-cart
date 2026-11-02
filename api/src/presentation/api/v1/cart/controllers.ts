import type { CookieOptions, RequestHandler, Request, Response } from "express";
import type { RouterDependencies } from "../router.js";

const cartTokenName = "cartToken";

/** Guest-cart cookie lifetime: 15 days, renewed on every activity beat. */
const CART_TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Reads the raw cart token from the cookies, same defensive discipline as the
 * auth refresh token but non-throwing: a missing cookie simply means there is
 * no cart to resume yet.
 */
function readCartToken(cookies: unknown): string | null {
  if (
    typeof cookies === "object" &&
    cookies !== null &&
    cartTokenName in cookies &&
    typeof cookies[cartTokenName] === "string" &&
    cookies[cartTokenName]
  )
    return cookies[cartTokenName];
  return null;
}

type CartControllers = Record<"registerActivity" | "empty", RequestHandler>;

export function createCartControllers(deps: RouterDependencies): CartControllers {
  const { cart } = deps;
  const cookie: CookieOptions = {
    httpOnly: true,
    secure: deps.secureCookies,
    sameSite: deps.secureCookies ? "none" : "lax",
    path: "/",
  };

  function renewCookie(res: Response, token: string): void {
    res.cookie(cartTokenName, token, {
      ...cookie,
      expires: new Date(Date.now() + CART_TOKEN_TTL_MS),
    });
  }

  return {
    registerActivity: async (req: Request, res) => {
      const currentToken = readCartToken(req.cookies);
      const result = await cart.activity.register.execute({ token: currentToken });
      const token = result.created ? result.token : currentToken;
      if (token !== null) renewCookie(res, token);
      res.set("Cache-Control", "no-store");
      res.status(result.created ? 201 : 204).end();
    },
    empty: async (req, res) => {
      await cart.empty.execute({ token: readCartToken(req.cookies) });
      res.clearCookie(cartTokenName, cookie);
      res.set("Cache-Control", "no-store");
      res.status(204).end();
    },
  };
}

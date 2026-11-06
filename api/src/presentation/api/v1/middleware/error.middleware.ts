import type { NextFunction, Request, Response } from "express";
import { BaseError } from "../../../../domain/shared/errors/base-error.js";
import { ValidateError } from "../../../../domain/shared/errors/validate-error.js";

const INTERNAL_SERVER_ERROR = "Internal server error";
const INVALID_JSON_BODY = "Invalid JSON body";

/** Identifies the 400 error produced by Express when `express.json()` cannot parse a body. */
function isJsonParseError(err: unknown): boolean {
  return (
    err instanceof SyntaxError &&
    typeof err === "object" &&
    "type" in err &&
    err.type === "entity.parse.failed"
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err);

  if (isJsonParseError(err)) {
    res.status(400).json({ detail: INVALID_JSON_BODY });
    return;
  }

  if (err instanceof ValidateError) {
    res.status(err.status_code).json({ detail: err.details ?? err.message });
    return;
  }

  if (err instanceof BaseError) {
    res.status(err.status_code).json({ detail: err.message });
    return;
  }

  res.status(500).json({ detail: INTERNAL_SERVER_ERROR });
}

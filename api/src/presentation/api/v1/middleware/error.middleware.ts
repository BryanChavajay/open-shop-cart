import type { NextFunction, Request, Response } from "express";
import { BaseError } from "../../../../domain/errors/base-error.js";
import { ValidateError } from "../../../../domain/errors/validate-error.js";

const INTERNAL_SERVER_ERROR = "Internal server error";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err);

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

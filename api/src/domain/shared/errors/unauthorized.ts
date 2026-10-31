import { BaseError } from "./base-error.js";

export class UnauthorizedError extends BaseError {
  constructor(
    message: string,
    code: string | undefined,
    details: string | undefined,
    location: string | undefined,
  ) {
    super(message, code ?? "UNAUTHORIZED_ERROR", details, location, 401);
  }
}

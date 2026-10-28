import { BaseError } from "./base-error.js";

export class ForbiddenError extends BaseError {
  constructor(
    message: string,
    code: string | undefined,
    details: string | undefined,
    location: string | undefined,
  ) {
    super(message, code ?? "FORBIDDEN_ERROR", details, location, 403);
  }
}

import { BaseError } from "./base-error.js";

export class NotFoundError extends BaseError {
  constructor(
    message: string,
    code: string | undefined,
    details: string | undefined,
    location: string | undefined,
  ) {
    super(message, code ?? "NOT_FOUND", details, location, 404);
  }
}

import { BaseError } from "./base-error.js";

export class ConflictError extends BaseError {
  constructor(
    message: string,
    code: string | undefined,
    details: string | undefined,
    location: string | undefined,
  ) {
    super(message, code ?? "CONFLICT_ERROR", details, location, 409);
  }
}

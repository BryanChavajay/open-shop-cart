import { BaseError } from "./base-error.js";

export class ValidateError extends BaseError {
  constructor(
    message: string,
    code: string | undefined,
    details: string | undefined,
    location: string | undefined,
  ) {
    super(message, code ?? "VALIDATE_ERROR", details, location, 422);
  }
}

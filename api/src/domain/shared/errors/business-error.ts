import { BaseError } from "./base-error.js";

export class BusinessRuleViolation extends BaseError {
  constructor(
    message: string,
    code: string | undefined,
    details: string | undefined,
    location: string | undefined,
  ) {
    super(message, code ?? "BUSINESS_RULE_VIOLATION", details, location, 400);
  }
}

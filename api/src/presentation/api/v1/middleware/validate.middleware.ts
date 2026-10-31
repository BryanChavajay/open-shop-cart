import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ValidateError } from "../../../../domain/shared/errors/validate-error.js";

export type ValidationSource = "body" | "params" | "query";

/** Los valores validados se exponen en res.locals.validated, incluido query de Express 5. */
export function validate(schema: ZodType, source: ValidationSource = "body"): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => `${issue.path.join(".") || source}: ${issue.message}`).join("; ");
      return next(new ValidateError("Solicitud inválida", undefined, details, source));
    }
    res.locals.validated = { ...res.locals.validated, [source]: result.data };
    next();
  };
}

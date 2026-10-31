import { ConflictError } from "./conflict-error.js";

/** Storage-neutral uniqueness conflict; the caller decides its business meaning. */
export class DuplicateKeyError extends ConflictError {
  constructor() { super("El registro ya existe", undefined, undefined, undefined); }
}

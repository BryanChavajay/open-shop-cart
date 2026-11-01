/**
 * Guard for an internal identifier that must have been loaded from
 * persistence (e.g. the autoincremental id of a restored entity).
 */
export function requireInternalId(id: number | null): number {
  if (id === null) {
    throw new Error("The entity was loaded without its internal identifier");
  }
  return id;
}

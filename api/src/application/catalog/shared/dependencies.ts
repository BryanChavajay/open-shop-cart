/**
 * Responsible user of a catalog write operation.
 *
 * Used ONLY for the audit trail: the AuditEntry requires the internal user
 * identifier, so presentation maps the guarded current user (`currentUser.id`)
 * into this actor. Authorization is enforced by the guard middleware.
 */
export interface CatalogActor {
  /** Internal identifier of the authenticated user. */
  id: number;
}

/**
 * Responsible user of an orders operation.
 *
 * Used ONLY for the audit trail: the AuditEntry requires the internal user
 * identifier, so presentation maps the guarded current user
 * (`currentUser.id`) into this actor. Authorization (customer vs staff) is
 * enforced by the guard middleware, so the actor carries no role: the staff
 * use cases hard-code the `Role.OPERADOR` domain behavior, which is identical
 * to `ADMINISTRADOR` inside the order entity.
 */
export interface OrderActor {
  /** Internal identifier of the authenticated user. */
  id: number;
}

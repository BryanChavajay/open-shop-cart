/** Elemento del listado administrativo de registros de bitácora. */
export interface AuditListItemReadModel {
  /** Identificador del registro (BIGINT de SQL Server, serializado como cadena). */
  id: string;
  moduleCode: number;
  entityType: string;
  entityIdentifier: string;
  action: string;
  userPublicId: string;
  userFirstName: string;
  userLastName: string | null;
  registeredAt: Date;
}

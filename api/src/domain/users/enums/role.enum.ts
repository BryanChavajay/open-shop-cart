/**
 * Roles del sistema. Los valores se persisten y se transmiten tal cual.
 */
export enum Role {
  /** Cliente: compra y consulta su propia información. */
  CLIENTE = "CLIENTE",
  /** Personal interno: gestiona pedidos e inventario. */
  OPERADOR = "OPERADOR",
  /** Personal interno con gestión completa, incluida la de usuarios. */
  ADMINISTRADOR = "ADMINISTRADOR",
}

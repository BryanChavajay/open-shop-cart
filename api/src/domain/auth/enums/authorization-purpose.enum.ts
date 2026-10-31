/**
 * Propósito de una autorización temporal de un solo uso enviada por correo.
 */
export enum AuthorizationPurpose {
  /** Activa la cuenta de un cliente recién registrado. Vigencia: 24 horas. */
  ACCOUNT_CONFIRMATION = "ACCOUNT_CONFIRMATION",
  /** Permite establecer una nueva contraseña. Vigencia: 30 minutos. */
  PASSWORD_RECOVERY = "PASSWORD_RECOVERY",
  /** Propósito retirado; se conserva para leer y cancelar registros históricos. */
  EMAIL_CHANGE = "EMAIL_CHANGE",
}

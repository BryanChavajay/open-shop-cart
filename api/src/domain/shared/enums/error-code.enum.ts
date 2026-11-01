/**
 * Códigos estables de error de negocio. Se usan como `code` de los errores de dominio.
 */
export enum ErrorCode {
  PASSWORD_RECOVERY_DISABLED = "PASSWORD_RECOVERY_DISABLED",
  /** Un dato obligatorio no fue proporcionado. */
  REQUIRED_FIELD_MISSING = "REQUIRED_FIELD_MISSING",
  /** La entrada no cumple el formato o las reglas del campo. */
  INVALID_INPUT = "INVALID_INPUT",
  /** El rol solicitado no está permitido para la operación. */
  INVALID_ROLE_ASSIGNMENT = "INVALID_ROLE_ASSIGNMENT",
  /** El estado actual del usuario no permite la operación. */
  INVALID_USER_STATE = "INVALID_USER_STATE",
  /** El correo ya pertenece a otro usuario, incluso eliminado. */
  EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED",
  /** Correo o contraseña incorrectos. No distingue cuál dato falló. */
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  /** El usuario indicado no existe. */
  USER_NOT_FOUND = "USER_NOT_FOUND",
  /** La autorización temporal es inválida, vencida o ya fue utilizada. */
  INVALID_OR_EXPIRED_TOKEN = "INVALID_OR_EXPIRED_TOKEN",
  /** La sesión, el token o el estado de la cuenta no son vigentes. */
  SESSION_INVALID = "SESSION_INVALID",
  /** Se detectó reutilización de un refresh token; la cadena fue revocada. */
  REFRESH_TOKEN_REUSED = "REFRESH_TOKEN_REUSED",
  /** El usuario autenticado no tiene el rol requerido. */
  ACCESS_DENIED = "ACCESS_DENIED",
  /** La operación sobre el propio usuario no está permitida. */
  SELF_OPERATION_NOT_ALLOWED = "SELF_OPERATION_NOT_ALLOWED",
  /** Debe permanecer al menos un administrador activo. */
  LAST_ACTIVE_ADMINISTRATOR = "LAST_ACTIVE_ADMINISTRATOR",
  /** La operación no aplica a usuarios con rol CLIENTE desde esta vía. */
  CLIENT_MANAGEMENT_NOT_ALLOWED = "CLIENT_MANAGEMENT_NOT_ALLOWED",
  /** El registro fue modificado por otra operación concurrente. */
  CONCURRENT_MODIFICATION = "CONCURRENT_MODIFICATION",
  /** El registro de bitácora indicado no existe. */
  AUDIT_ENTRY_NOT_FOUND = "AUDIT_ENTRY_NOT_FOUND",
}

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
  /** The current state of a catalog entity does not allow the operation. */
  INVALID_CATALOG_ENTITY_STATE = "INVALID_CATALOG_ENTITY_STATE",
  /** A catalog entity cannot be activated because a required related collection is empty. */
  EMPTY_CATALOG_COLLECTION = "EMPTY_CATALOG_COLLECTION",
  /** Another active catalog entity (category/brand) already uses the name. */
  DUPLICATE_CATALOG_NAME = "DUPLICATE_CATALOG_NAME",
  /** The SKU already belongs to another variant, even a deleted one. */
  DUPLICATE_SKU = "DUPLICATE_SKU",
  /** The variant already has the same combination of option values. */
  DUPLICATE_VARIANT_COMBO = "DUPLICATE_VARIANT_COMBO",
  /** The option already has a value with the same text. */
  DUPLICATE_OPTION_VALUE = "DUPLICATE_OPTION_VALUE",
  /** The uploaded image exceeds the allowed size. */
  IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE",
  /** The uploaded image format is not supported. */
  UNSUPPORTED_IMAGE_FORMAT = "UNSUPPORTED_IMAGE_FORMAT",
  /** The uploaded image bytes are corrupted or unreadable. */
  CORRUPTED_IMAGE = "CORRUPTED_IMAGE",
  /** The variant or stock resource addressed by a stock endpoint does not exist. */
  STOCK_NOT_FOUND = "STOCK_NOT_FOUND",
  /** The requested quantity exceeds the available stock. */
  INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK",
  /** The change would leave the physical stock negative or below active reservations. */
  INSUFFICIENT_PHYSICAL_STOCK = "INSUFFICIENT_PHYSICAL_STOCK",
  /** The stock reservation addressed by the operation does not exist. */
  STOCK_RESERVATION_NOT_FOUND = "STOCK_RESERVATION_NOT_FOUND",
  /** The reservation state does not allow the requested operation. */
  STOCK_RESERVATION_INVALID_STATE = "STOCK_RESERVATION_INVALID_STATE",
  /** The reservation deadline has already passed, so it cannot be consumed. */
  STOCK_RESERVATION_EXPIRED = "STOCK_RESERVATION_EXPIRED",
  /** The idempotency key was reused with different content. */
  IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT",
  /** The variant still has physical stock or active reservations, blocking deletion. */
  VARIANT_HAS_STOCK = "VARIANT_HAS_STOCK",
  /** The cart addressed by the operation does not exist or is not active. */
  CART_NOT_FOUND = "CART_NOT_FOUND",
  /** The current state of a cart does not allow the operation. */
  INVALID_CART_STATE = "INVALID_CART_STATE",
}

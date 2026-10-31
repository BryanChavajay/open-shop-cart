/**
 * Tipo de token JWT. Se incluye en el claim `token_use` para impedir que
 * un access token se use como refresh token o viceversa.
 */
export enum TokenUse {
  /** Token de acceso de corta duración, enviado en el cuerpo de la respuesta. */
  ACCESS = "access",
  /** Token de renovación, enviado únicamente en cookie HttpOnly. */
  REFRESH = "refresh",
}

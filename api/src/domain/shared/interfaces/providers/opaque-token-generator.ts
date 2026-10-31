/** Tokens aleatorios opacos para autorizaciones temporales enviadas por correo. */
export interface OpaqueTokenGenerator {
  /** Genera un token aleatorio criptográficamente seguro, apto para URL. */
  generate(): string;
  /** Hash determinista del token para almacenarlo sin exponer el valor original. */
  hash(token: string): string;
}

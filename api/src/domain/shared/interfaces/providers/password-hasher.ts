/** Hashing de contraseñas (Argon2id en infraestructura). */
export interface PasswordHasher {
  hash(plainText: string): Promise<string>;
  verify(hash: string, plainText: string): Promise<boolean>;
}

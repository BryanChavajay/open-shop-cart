/** Cifrado simétrico de secretos en reposo (por ejemplo, payloads de la outbox). */
export interface SecretCipher {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
}

/** Data access to blocked refresh JTIs. Valid, unused JWTs are not persisted. */
export interface RefreshTokenRepository {
  exists(jti: string): Promise<boolean>;
  /** Insertion is unique; duplicate writes throw DuplicateKeyError. */
  save(jti: string): Promise<void>;
}

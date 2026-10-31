import type { AuthorizationPurpose } from "../../enums/authorization-purpose.enum.js";

export interface AuthorizationTokenData {
  userId: number;
  purpose: AuthorizationPurpose;
  tokenHash: string;
  pendingEmail: string | null;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface AuthorizationTokenRecord extends AuthorizationTokenData {
  id: number;
  userPublicId: string;
}

export interface AuthorizationTokenRepository {
  insert(data: AuthorizationTokenData): Promise<void>;
  findByHash(
    purpose: AuthorizationPurpose,
    tokenHash: string,
  ): Promise<AuthorizationTokenRecord | null>;
  listByUser(
    userId: number,
    purpose: AuthorizationPurpose,
  ): Promise<AuthorizationTokenRecord[]>;
  updateUsedAt(id: number, usedAt: Date): Promise<void>;
}

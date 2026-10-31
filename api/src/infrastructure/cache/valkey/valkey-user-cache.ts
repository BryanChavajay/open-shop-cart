import type { Redis } from "ioredis";
import type { CurrentUserReadModel } from "../../../domain/users/readmodels/current-user.read-model.js";
import type { UserCache } from "../../../domain/users/interfaces/cache/user-cache.js";

export class ValkeyUserCache implements UserCache {
  constructor(
    private readonly client: Redis,
    private readonly ttlSeconds: number,
  ) {}
  async get(publicId: string): Promise<CurrentUserReadModel | null> {
    const value = await this.client.get(`user:current:${publicId}`);
    if (value === null) return null;
    // JSON decoding is a storage concern; state/role/session decisions belong to callers.
    const user: CurrentUserReadModel = JSON.parse(value);
    return user;
  }

  async set(user: CurrentUserReadModel): Promise<void> {
    await this.client.set(
      `user:current:${user.publicId}`,
      JSON.stringify(user),
      "EX",
      this.ttlSeconds,
    );
  }

  async delete(publicId: string): Promise<void> {
    await this.client.del(`user:current:${publicId}`);
  }
}

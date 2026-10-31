import type { CurrentUserReadModel } from "../../readmodels/current-user.read-model.js";

export interface UserCache {
  get(publicId: string): Promise<CurrentUserReadModel | null>;
  set(user: CurrentUserReadModel): Promise<void>;
  delete(publicId: string): Promise<void>;
}

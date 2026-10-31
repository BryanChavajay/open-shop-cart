import type { CreateUser } from "./create-user.js";
import type { UpdateUser } from "./update-user.js";
import type { UpdateOwnProfile } from "./update-own-profile.js";
import type { ActivateUser } from "./activate-user.js";
import type { DeactivateUser } from "./deactivate-user.js";
import type { DeleteUser } from "./delete-user.js";
import type { GetUser } from "./get-user.js";
import type { ListUsers } from "./list-users.js";
import type { BootstrapAdministrator } from "./bootstrap-administrator.js";
import type { StartPasswordRecovery } from "./start-password-recovery.js";
import type { ResendConfirmation } from "./resend-confirmation.js";

export type { UserActor } from "./dependencies.js";
export interface UserUseCases {
  create: CreateUser;
  update: UpdateUser;
  updateOwnProfile: UpdateOwnProfile;
  activate: ActivateUser;
  deactivate: DeactivateUser;
  delete: DeleteUser;
  get: GetUser;
  list: ListUsers;
  bootstrap: BootstrapAdministrator;
  startRecovery: StartPasswordRecovery;
  resendConfirmation: ResendConfirmation;
}

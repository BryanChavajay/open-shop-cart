import type { Login } from "./login.js";
import type { RefreshSession } from "./refresh-session.js";
import type { Logout } from "./logout.js";
import type { LogoutAll } from "./logout-all.js";
import type { RegisterClient } from "./register-client.js";
import type { RequestPasswordRecovery } from "./request-password-recovery.js";
import type { ResetPassword } from "./reset-password.js";
import type { ConfirmAccount } from "./confirm-account.js";

export type { AuthTokens, AuthSession } from "./dependencies.js";
export interface Authentication {
  login: Login;
  refresh: RefreshSession;
  logout: Logout;
  logoutAll: LogoutAll;
  register: RegisterClient;
  requestPasswordRecovery: RequestPasswordRecovery;
  resetPassword: ResetPassword;
  confirmAccount: ConfirmAccount;
}

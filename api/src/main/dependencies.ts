import type { ConnectionPool } from "mssql";
import type { Redis } from "ioredis";
import { env } from "../config.js";
import { Login } from "../application/auth/login.js";
import { RefreshSession } from "../application/auth/refresh-session.js";
import { Logout } from "../application/auth/logout.js";
import { LogoutAll } from "../application/auth/logout-all.js";
import { RegisterClient } from "../application/auth/register-client.js";
import { RequestPasswordRecovery } from "../application/auth/request-password-recovery.js";
import { ResetPassword } from "../application/auth/reset-password.js";
import { ConfirmAccount } from "../application/auth/confirm-account.js";
import { CreateUser } from "../application/users/create-user.js";
import { UpdateUser } from "../application/users/update-user.js";
import { UpdateOwnProfile } from "../application/users/update-own-profile.js";
import { ActivateUser } from "../application/users/activate-user.js";
import { DeactivateUser } from "../application/users/deactivate-user.js";
import { DeleteUser } from "../application/users/delete-user.js";
import { GetUser } from "../application/users/get-user.js";
import { ListUsers } from "../application/users/list-users.js";
import { ListAuditEntries } from "../application/audit/list-audit-entries.js";
import { GetAuditEntry } from "../application/audit/get-audit-entry.js";
import { BootstrapAdministrator } from "../application/users/bootstrap-administrator.js";
import { StartPasswordRecovery } from "../application/users/start-password-recovery.js";
import { ResendConfirmation } from "../application/users/resend-confirmation.js";
import { ProcessOutbox } from "../application/auth/process-email-outbox.js";
import { AuthorizationPurpose } from "../domain/auth/enums/authorization-purpose.enum.js";
import type { UserCache } from "../domain/users/interfaces/cache/user-cache.js";
import { PoolSqlExecutor } from "../infrastructure/persistence/mssql/sql-executor.js";
import { MssqlUserRepository } from "../infrastructure/persistence/mssql/repositories/mssql-user.repository.js";
import { MssqlAuthorizationTokenRepository } from "../infrastructure/persistence/mssql/repositories/mssql-authorization-token.repository.js";
import { MssqlRefreshTokenRepository } from "../infrastructure/persistence/mssql/repositories/mssql-refresh-token.repository.js";
import { MssqlEmailOutboxRepository } from "../infrastructure/persistence/mssql/repositories/mssql-email-outbox.repository.js";
import { MssqlAuditRepository } from "../infrastructure/persistence/mssql/repositories/mssql-audit.repository.js";
import { MssqlUnitOfWork } from "../infrastructure/persistence/mssql/mssql-unit-of-work.js";
import { ValkeyUserCache } from "../infrastructure/cache/valkey/valkey-user-cache.js";
import { JoseTokenService } from "../infrastructure/security/jwt-providers/jose-token-service.js";
import { Argon2PasswordHasher } from "../infrastructure/security/password-hashers/argon2-password-hasher.js";
import { AesGcmSecretCipher } from "../infrastructure/security/encryption-providers/aes-gcm-secret-cipher.js";
import { CryptoOpaqueTokenGenerator } from "../infrastructure/security/token-generators/crypto-opaque-token-generator.js";
import { UuidIdentifierGenerator } from "../infrastructure/identifiers/uuid-identifier-generator.js";
import { SystemClock } from "../infrastructure/clock/system-clock.js";
import { NodemailerEmailSender } from "../infrastructure/email/nodemailer-email-sender.js";

const noCache: UserCache = { async get() { return null; }, async set() {}, async delete() {} };

// Se construye una vez al arrancar: proveedores → repositorios → casos de uso.
export function createDependencies(pool: ConnectionPool, client?: Redis) {
  const tokenService = new JoseTokenService();
  const identifiers = new UuidIdentifierGenerator();
  const passwordHasher = new Argon2PasswordHasher();
  const opaqueTokenGenerator = new CryptoOpaqueTokenGenerator();
  const secretCipher = new AesGcmSecretCipher();
  const clock = new SystemClock();
  const lifetime = env.REFRESH_TOKEN_EXPIRE_HOURS * 3_600_000;
  const executor = new PoolSqlExecutor(pool);
  const users = new MssqlUserRepository(executor);
  const cache = client ? new ValkeyUserCache(client, Math.ceil(env.CURRENT_USER_CACHE_TTL_SECONDS)) : noCache;
  const authorizationTokens = new MssqlAuthorizationTokenRepository(executor);
  const outbox = new MssqlEmailOutboxRepository(executor);
  const refreshTokens = new MssqlRefreshTokenRepository(executor);
  // Append-only audit log; shared with audited business modules.
  const audit = new MssqlAuditRepository(executor);
  const unitOfWork = new MssqlUnitOfWork(pool);

  return {
    identity: { tokens: tokenService, users, cache },
    users: {
      create: new CreateUser(users, identifiers, passwordHasher),
      update: new UpdateUser(users, identifiers, cache),
      updateOwnProfile: new UpdateOwnProfile(users, identifiers, cache, passwordHasher),
      activate: new ActivateUser(users, identifiers, cache),
      deactivate: new DeactivateUser(users, identifiers, cache),
      delete: new DeleteUser(users, identifiers, cache),
      get: new GetUser(users),
      list: new ListUsers(users),
      bootstrap: new BootstrapAdministrator(users, identifiers, passwordHasher),
      startRecovery: new StartPasswordRecovery(users, authorizationTokens, outbox, opaqueTokenGenerator, secretCipher, clock, env.EMAIL_SERVICE_ENABLED),
      resendConfirmation: new ResendConfirmation(users, authorizationTokens, outbox, opaqueTokenGenerator, secretCipher, clock),
    },
    auth: {
      login: new Login(users, passwordHasher, tokenService, identifiers, clock, lifetime),
      refresh: new RefreshSession(refreshTokens, users, tokenService, identifiers, clock, lifetime),
      logout: new Logout(refreshTokens, tokenService),
      logoutAll: new LogoutAll(users, identifiers, cache),
      register: new RegisterClient(users, authorizationTokens, outbox, identifiers, passwordHasher, opaqueTokenGenerator, secretCipher, clock, env.EMAIL_SERVICE_ENABLED),
      requestPasswordRecovery: new RequestPasswordRecovery(users, authorizationTokens, outbox, opaqueTokenGenerator, secretCipher, clock, env.EMAIL_SERVICE_ENABLED),
      resetPassword: new ResetPassword(users, authorizationTokens, identifiers, opaqueTokenGenerator, passwordHasher, clock, cache, env.EMAIL_SERVICE_ENABLED),
      confirmAccount: new ConfirmAccount(users, authorizationTokens, identifiers, opaqueTokenGenerator, clock, cache),
    },
    audit: {
      list: new ListAuditEntries(audit),
      get: new GetAuditEntry(audit),
    },
    unitOfWork,
    outboxProcessor: new ProcessOutbox(outbox, new NodemailerEmailSender(),
      secretCipher, clock, {
      [AuthorizationPurpose.ACCOUNT_CONFIRMATION]: new URL("/confirm-account", env.FRONTEND_HOST).toString(),
      [AuthorizationPurpose.PASSWORD_RECOVERY]: new URL("/reset-password", env.FRONTEND_HOST).toString(),
    }, 60_000, env.EMAIL_SERVICE_ENABLED),
  };
}

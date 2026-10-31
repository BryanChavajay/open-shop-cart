import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import { Role } from "../enums/role.enum.js";

/** Roles que corresponden a personal interno. */
export const INTERNAL_ROLES: readonly Role[] = [Role.OPERADOR, Role.ADMINISTRADOR];

/** Estado completo de un usuario, usado para reconstruir la entidad desde persistencia. */
export interface UserSnapshot {
  /** Identificador interno autoincremental. Null mientras el usuario no ha sido persistido. */
  id: number | null;
  /** Identificador público (UUID v7). Único e inmutable. */
  publicId: string;
  firstName: string;
  lastName: string | null;
  /** Correo normalizado (minúsculas, sin espacios). */
  email: string;
  /** Hash de la contraseña. Nunca se expone fuera de la capa de dominio/persistencia. */
  passwordHash: string;
  role: Role;
  isActive: boolean;
  isDeleted: boolean;
  /** Versión de sesión (UUID v4). Cambia con cada modificación para invalidar tokens. */
  sessionVersion: string;
}

export interface NewClientData {
  publicId: string;
  firstName: string;
  lastName: string | null;
  email: string;
  passwordHash: string;
  sessionVersion: string;
}

export interface NewInternalUserData extends NewClientData {
  role: Role;
}

/**
 * Entidad de usuario. Todas las modificaciones pasan por métodos que validan
 * las reglas de negocio y reciben la nueva versión de sesión a aplicar.
 */
export class User {
  private state: UserSnapshot;

  private constructor(state: UserSnapshot) {
    this.state = state;
  }

  /** Normaliza un correo para comparaciones y almacenamiento. */
  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  static validatePassword(password: string): void {
    User.requireValue(password, "password");
  }

  /** Crea un cliente; solo queda inactivo cuando el registro requiere confirmación. */
  static registerClient(data: NewClientData, emailServiceEnabled: boolean): User {
    return new User({
      id: null,
      publicId: data.publicId,
      firstName: User.requireName(data.firstName, "firstName"),
      lastName: User.optionalName(data.lastName),
      email: User.normalizeEmail(User.requireValue(data.email, "email")),
      passwordHash: User.requireValue(data.passwordHash, "passwordHash"),
      role: Role.CLIENTE,
      isActive: !emailServiceEnabled,
      isDeleted: false,
      sessionVersion: data.sessionVersion,
    });
  }

  /** Crea personal interno (OPERADOR o ADMINISTRADOR): activo y no eliminado. */
  static createInternal(data: NewInternalUserData): User {
    User.assertInternalRole(data.role);
    return new User({
      id: null,
      publicId: data.publicId,
      firstName: User.requireName(data.firstName, "firstName"),
      lastName: User.optionalName(data.lastName),
      email: User.normalizeEmail(User.requireValue(data.email, "email")),
      passwordHash: User.requireValue(data.passwordHash, "passwordHash"),
      role: data.role,
      isActive: true,
      isDeleted: false,
      sessionVersion: data.sessionVersion,
    });
  }

  /** Reconstruye la entidad desde su estado persistido, sin validar transiciones. */
  static restore(snapshot: UserSnapshot): User {
    return new User({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get publicId(): string {
    return this.state.publicId;
  }

  get firstName(): string {
    return this.state.firstName;
  }

  get lastName(): string | null {
    return this.state.lastName;
  }

  get email(): string {
    return this.state.email;
  }

  get passwordHash(): string {
    return this.state.passwordHash;
  }

  get role(): Role {
    return this.state.role;
  }

  get isActive(): boolean {
    return this.state.isActive;
  }

  get isDeleted(): boolean {
    return this.state.isDeleted;
  }

  get sessionVersion(): string {
    return this.state.sessionVersion;
  }

  isClient(): boolean {
    return this.state.role === Role.CLIENTE;
  }

  isInternalStaff(): boolean {
    return INTERNAL_ROLES.includes(this.state.role);
  }

  /** Cliente registrado que aún no confirma su correo. */
  isPendingConfirmation(): boolean {
    return this.isClient() && !this.state.isActive && !this.state.isDeleted;
  }

  /** Indica si la cuenta puede realizar acciones autenticadas. */
  canAuthenticate(): boolean {
    return this.state.isActive && !this.state.isDeleted;
  }

  /** Actualiza nombres. Cualquier modificación invalida sesiones previas. */
  updateName(firstName: string, lastName: string | null, nextSessionVersion: string): void {
    this.assertNotDeleted();
    this.state.firstName = User.requireName(firstName, "firstName");
    this.state.lastName = User.optionalName(lastName);
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Reemplaza directamente el correo e invalida las sesiones anteriores. */
  changeEmail(email: string, nextSessionVersion: string): void {
    this.assertNotDeleted();
    this.state.email = User.normalizeEmail(User.requireValue(email, "email"));
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Cambia el rol de personal interno. Un cliente no puede cambiar de rol por esta vía. */
  changeRole(role: Role, nextSessionVersion: string): void {
    this.assertNotDeleted();
    if (!this.isInternalStaff()) {
      throw new BusinessRuleViolation(
        "Solo el personal interno puede cambiar de rol",
        ErrorCode.CLIENT_MANAGEMENT_NOT_ALLOWED,
        undefined,
        undefined,
      );
    }
    User.assertInternalRole(role);
    this.state.role = role;
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Activa la cuenta de un cliente pendiente tras confirmar su correo. */
  confirmAccount(nextSessionVersion: string): void {
    if (!this.isPendingConfirmation()) {
      throw new BusinessRuleViolation(
        "La cuenta no está pendiente de confirmación",
        ErrorCode.INVALID_USER_STATE,
        undefined,
        undefined,
      );
    }
    this.state.isActive = true;
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Activa personal interno. */
  activate(nextSessionVersion: string): void {
    this.assertStaffManageable();
    this.state.isActive = true;
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Desactiva personal interno sin eliminarlo. */
  deactivate(nextSessionVersion: string): void {
    this.assertStaffManageable();
    this.state.isActive = false;
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Eliminación lógica de personal interno. Conserva el correo reservado. */
  markDeleted(nextSessionVersion: string): void {
    this.assertStaffManageable();
    this.state.isDeleted = true;
    this.state.isActive = false;
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Invalida todas las sesiones del usuario sin modificar sus datos (logout global). */
  revokeSessions(nextSessionVersion: string): void {
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Sustituye el hash de contraseña. El estado de activación no cambia. */
  replacePasswordHash(passwordHash: string, nextSessionVersion: string): void {
    this.assertNotDeleted();
    this.state.passwordHash = User.requireValue(passwordHash, "passwordHash");
    this.state.sessionVersion = nextSessionVersion;
  }

  /** Copia del estado actual. */
  toSnapshot(): UserSnapshot {
    return { ...this.state };
  }

  private assertNotDeleted(): void {
    if (this.state.isDeleted) {
      throw new BusinessRuleViolation(
        "El usuario fue eliminado",
        ErrorCode.INVALID_USER_STATE,
        undefined,
        undefined,
      );
    }
  }

  private assertStaffManageable(): void {
    this.assertNotDeleted();
    if (!this.isInternalStaff()) {
      throw new BusinessRuleViolation(
        "Esta operación solo aplica a personal interno",
        ErrorCode.CLIENT_MANAGEMENT_NOT_ALLOWED,
        undefined,
        undefined,
      );
    }
  }

  private static assertInternalRole(role: Role): void {
    if (!INTERNAL_ROLES.includes(role)) {
      throw new BusinessRuleViolation(
        "El rol no corresponde a personal interno",
        ErrorCode.INVALID_ROLE_ASSIGNMENT,
        undefined,
        undefined,
      );
    }
  }

  private static requireValue(value: string, field: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleViolation(
        `El dato obligatorio ${field} no fue proporcionado`,
        ErrorCode.REQUIRED_FIELD_MISSING,
        field,
        undefined,
      );
    }
    return trimmed;
  }

  private static requireName(value: string, field: string): string {
    return User.requireValue(value, field);
  }

  private static optionalName(value: string | null): string | null {
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}

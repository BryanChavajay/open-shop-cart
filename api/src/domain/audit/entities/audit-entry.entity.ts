import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import { AuditAction } from "../enums/audit-action.enum.js";
import { AuditModule } from "../enums/audit-module.enum.js";

/** Estado completo de un registro de bitácora, usado para reconstruir la entidad desde persistencia. */
export interface AuditEntrySnapshot {
  /** Identificador interno del usuario que realizó la operación. */
  userId: number;
  moduleCode: AuditModule;
  /** Tipo de entidad afectada. */
  entityType: string;
  /** Identificador de la entidad afectada dentro de su tipo. */
  entityIdentifier: string;
  action: AuditAction;
  /** Valores previos al cambio. Null cuando la operación es una creación. */
  previousValues: Record<string, unknown> | null;
  /** Valores resultantes del cambio. Null cuando la operación es una eliminación o desactivación. */
  newValues: Record<string, unknown> | null;
}

export interface AuditEntryData extends AuditEntrySnapshot {}

/**
 * Entidad de bitácora. Es inmutable y append-only: no expone métodos de mutación.
 */
export class AuditEntry {
  private state: AuditEntrySnapshot;

  private constructor(state: AuditEntrySnapshot) {
    this.state = state;
  }

  /** Valida los datos del registro y crea la entidad. */
  static create(data: AuditEntryData): AuditEntry {
    const userId = AuditEntry.requireUserId(data.userId);
    const moduleCode = AuditEntry.requireModule(data.moduleCode);
    const entityType = AuditEntry.requireEntityType(data.entityType, "entityType");
    const entityIdentifier = AuditEntry.requireEntityType(data.entityIdentifier, "entityIdentifier");
    AuditEntry.requireAction(data.action);
    const previousValues = AuditEntry.requireValues(data.previousValues, "previousValues");
    const newValues = AuditEntry.requireValues(data.newValues, "newValues");
    if (previousValues === null && newValues === null) {
      throw new BusinessRuleViolation(
        "Debe registrarse el valor anterior o el nuevo valor",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    return new AuditEntry({
      userId,
      moduleCode,
      entityType,
      entityIdentifier,
      action: data.action,
      previousValues,
      newValues,
    });
  }

  /** Reconstruye la entidad desde su estado persistido, sin validar transiciones. */
  static restore(snapshot: AuditEntrySnapshot): AuditEntry {
    return new AuditEntry({ ...snapshot });
  }

  get userId(): number {
    return this.state.userId;
  }

  get moduleCode(): AuditModule {
    return this.state.moduleCode;
  }

  get entityType(): string {
    return this.state.entityType;
  }

  get entityIdentifier(): string {
    return this.state.entityIdentifier;
  }

  get action(): AuditAction {
    return this.state.action;
  }

  get previousValues(): Record<string, unknown> | null {
    return this.state.previousValues;
  }

  get newValues(): Record<string, unknown> | null {
    return this.state.newValues;
  }

  /** Copia del estado actual. */
  toSnapshot(): AuditEntrySnapshot {
    return { ...this.state };
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

  private static requireUserId(userId: number): number {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BusinessRuleViolation(
        "El identificador de usuario es inválido",
        ErrorCode.INVALID_INPUT,
        "userId",
        undefined,
      );
    }
    return userId;
  }

  private static requireModule(moduleCode: AuditModule): AuditModule {
    if (!Object.values(AuditModule).includes(moduleCode)) {
      throw new BusinessRuleViolation(
        "El módulo de bitácora es inválido",
        ErrorCode.INVALID_INPUT,
        "moduleCode",
        undefined,
      );
    }
    return moduleCode;
  }

  private static requireEntityType(value: string, field: string): string {
    const trimmed = AuditEntry.requireValue(value, field);
    if (trimmed.length > 50) {
      throw new BusinessRuleViolation(
        `El dato ${field} excede la longitud permitida`,
        ErrorCode.INVALID_INPUT,
        field,
        undefined,
      );
    }
    return trimmed;
  }

  private static requireAction(action: AuditAction): void {
    if (!Object.values(AuditAction).includes(action)) {
      throw new BusinessRuleViolation(
        "La acción de bitácora es inválida",
        ErrorCode.INVALID_INPUT,
        "action",
        undefined,
      );
    }
  }

  private static requireValues(
    value: Record<string, unknown> | null,
    field: string,
  ): Record<string, unknown> | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new BusinessRuleViolation(
        `El dato ${field} debe ser un objeto`,
        ErrorCode.INVALID_INPUT,
        field,
        undefined,
      );
    }
    if (Object.keys(value).length === 0) {
      throw new BusinessRuleViolation(
        `El dato ${field} no contiene cambios`,
        ErrorCode.INVALID_INPUT,
        field,
        undefined,
      );
    }
    return value;
  }
}

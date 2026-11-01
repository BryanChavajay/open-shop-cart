import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { AuditDetailReadModel } from "../../domain/audit/readmodels/audit-detail.read-model.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface GetAuditEntryCommand {
  /** Identificador del registro como cadena decimal. */
  id: string;
}

export class GetAuditEntry {
  constructor(
    private readonly audit: Pick<AuditRepository, "findById">,
  ) {}

  async execute(command: GetAuditEntryCommand): Promise<AuditDetailReadModel> {
    if (!/^\d+$/.test(command.id))
      throw new BusinessRuleViolation(
        "Identificador de registro inválido",
        ErrorCode.INVALID_INPUT,
        "id",
        undefined,
      );

    const entry = await this.audit.findById(command.id);

    if (entry === null)
      throw new NotFoundError(
        "Registro de bitácora no encontrado",
        ErrorCode.AUDIT_ENTRY_NOT_FOUND,
        undefined,
        undefined,
      );

    return entry;
  }
}

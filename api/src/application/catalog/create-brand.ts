import { Brand } from "../../domain/catalog/entities/brand.entity.js";
import type { CatalogWriteRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { auditEntryForCatalog } from "./shared/audit.js";

export interface CreateBrandCommand {
  actor: CatalogActor;
  name: string;
  isActive: boolean;
}

/**
 * Creates a catalog brand inside a transaction.
 *
 * Name uniqueness is enforced by the filtered unique index UX_Marcas_Nombre:
 * no exception is captured here; the sql-error mapping turns the unique
 * violation into a DuplicateKeyError (409) automatically when it fails.
 */
export class CreateBrand {
  constructor(
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
  ) {}

  async execute(command: CreateBrandCommand): Promise<{ publicId: string }> {
    const brand = Brand.create({
      publicId: this.identifiers.newPublicId(),
      name: command.name,
      isActive: command.isActive,
    });

    await this.unitOfWork.run(async (exec) => {
      await this.writes.saveBrand(exec, brand);
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Brand",
            entityIdentifier: brand.publicId,
            action: AuditAction.CREATE,
            newValues: { name: brand.name, isActive: brand.isActive },
          },
          command.actor,
        ),
        exec,
      );
    });

    return { publicId: brand.publicId };
  }
}

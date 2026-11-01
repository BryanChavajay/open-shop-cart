import { Brand } from "../../domain/catalog/entities/brand.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { requireInternalId } from "./shared/entity-ids.js";

export interface DeleteBrandCommand {
  actor: CatalogActor;
  publicId: string;
}

/**
 * Soft-deletes a brand inside a transaction. The deletion is refused when
 * the brand still has (non-deleted) products. Deleting an already deleted
 * brand is not idempotent: it reports NotFoundError.
 */
export class DeleteBrand {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: DeleteBrandCommand): Promise<void> {
    const row = await this.reads.findBrandByPublicId(command.publicId);
    if (row === null || row.isDeleted) {
      throw new NotFoundError(
        "Brand not found",
        undefined,
        undefined,
        undefined,
      );
    }

    const brand = Brand.restore({
      id: row.id,
      publicId: row.publicId,
      name: row.name,
      isActive: row.isActive,
      isDeleted: row.isDeleted,
    });
    const previous = brand.toSnapshot();

    await this.unitOfWork.run(async (exec) => {
      // Reads inside the transaction to keep the guard and the delete atomic.
      const productPublicIds = await this.reads.findBrandProducts(
        exec,
        requireInternalId(brand.id),
      );
      if (productPublicIds.length > 0) {
        throw new ConflictError(
          "cannot delete brand with products",
          ErrorCode.INVALID_CATALOG_ENTITY_STATE,
          undefined,
          undefined,
        );
      }

      brand.markDeleted();
      await this.writes.softDeleteBrand(exec, requireInternalId(brand.id));
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Brand",
            entityIdentifier: brand.publicId,
            action: AuditAction.DELETE,
            previousValues: {
              name: previous.name,
              isActive: previous.isActive,
            },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

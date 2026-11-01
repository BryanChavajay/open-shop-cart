import { Category } from "../../domain/catalog/entities/category.entity.js";
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

export interface DeleteCategoryCommand {
  actor: CatalogActor;
  publicId: string;
}

/**
 * Soft-deletes a category inside a transaction. The deletion is refused when
 * the category still has (non-deleted) products. Deleting an already deleted
 * category is not idempotent: it reports NotFoundError.
 */
export class DeleteCategory {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: DeleteCategoryCommand): Promise<void> {
    const row = await this.reads.findCategoryByPublicId(command.publicId);
    if (row === null || row.isDeleted) {
      throw new NotFoundError(
        "Category not found",
        undefined,
        undefined,
        undefined,
      );
    }

    const category = Category.restore({
      id: row.id,
      publicId: row.publicId,
      name: row.name,
      isActive: row.isActive,
      isDeleted: row.isDeleted,
    });
    const previous = category.toSnapshot();

    await this.unitOfWork.run(async (exec) => {
      // Reads inside the transaction to keep the guard and the delete atomic.
      const productPublicIds = await this.reads.findCategoryProducts(
        exec,
        requireInternalId(category.id),
      );
      if (productPublicIds.length > 0) {
        throw new ConflictError(
          "cannot delete category with products",
          ErrorCode.INVALID_CATALOG_ENTITY_STATE,
          undefined,
          undefined,
        );
      }

      category.markDeleted();
      await this.writes.softDeleteCategory(
        exec,
        requireInternalId(category.id),
      );
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Category",
            entityIdentifier: category.publicId,
            action: AuditAction.DELETE,
            previousValues: { name: previous.name, isActive: previous.isActive },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

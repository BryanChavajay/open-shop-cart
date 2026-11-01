import { Category } from "../../domain/catalog/entities/category.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";

export interface UpdateCategoryCommand {
  actor: CatalogActor;
  publicId: string;
  name?: string | undefined;
  isActive?: boolean | undefined;
}

/**
 * Updates the basic data of a category. At least one field is required.
 * Changing `isActive` to false deactivates the category through the entity.
 */
export class UpdateCategory {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: UpdateCategoryCommand): Promise<void> {
    if (command.name === undefined && command.isActive === undefined) {
      throw new BusinessRuleViolation(
        "At least one field must be provided",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }

    const row = await this.reads.findCategoryByPublicId(command.publicId);
    // Logically deleted categories are not addressable in this iteration.
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

    if (command.name !== undefined) {
      category.update(command.name);
    }
    if (command.isActive !== undefined) {
      if (command.isActive) {
        category.activate();
      } else {
        category.deactivate();
      }
    }
    const current = category.toSnapshot();

    await this.unitOfWork.run(async (exec) => {
      await this.writes.saveCategory(exec, category);
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Category",
            entityIdentifier: category.publicId,
            action: AuditAction.UPDATE,
            previousValues: { name: previous.name, isActive: previous.isActive },
            newValues: { name: current.name, isActive: current.isActive },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

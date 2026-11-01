import { Product } from "../../domain/catalog/entities/product.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { requireInternalId } from "./shared/entity-ids.js";

export interface DeleteProductCommand {
  actor: CatalogActor;
  publicId: string;
}

/**
 * Soft-deletes a product inside a transaction. The stored procedure also
 * deactivates its variants. Deleting an already deleted product is NOT
 * idempotent: it reports NotFoundError.
 */
export class DeleteProduct {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: DeleteProductCommand): Promise<void> {
    const state = await this.reads.findProductStateByPublicId(command.publicId);
    if (state === null || state.isDeleted) {
      throw new NotFoundError(
        "Product not found",
        undefined,
        undefined,
        undefined,
      );
    }

    const previous = state;
    // Snapshot of the variant SKUs before the delete (they are never reused).
    const variantSkus = (
      await this.reads.listVariantsOfProduct(requireInternalId(state.id))
    ).map((variant) => variant.sku);

    const product = Product.restore(state);
    product.markDeleted();

    await this.unitOfWork.run(async (exec) => {
      await this.writes.softDeleteProduct(
        exec,
        requireInternalId(product.id),
      );
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Product",
            entityIdentifier: product.publicId,
            action: AuditAction.DELETE,
            previousValues: {
              name: previous.name,
              description: previous.description,
              categoryId: previous.categoryId,
              brandId: previous.brandId,
              isActive: previous.isActive,
              variantSkus,
            },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

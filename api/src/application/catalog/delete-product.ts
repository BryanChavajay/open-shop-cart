import { Product } from "../../domain/catalog/entities/product.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { requireInternalId } from "./shared/entity-ids.js";
import type { InventoryReadRepository } from "../../domain/inventory/interfaces/repositories/inventory.repository.js";

export interface DeleteProductCommand {
  actor: CatalogActor;
  publicId: string;
}

/**
 * Soft-deletes a product inside a transaction. The stored procedure also
 * deactivates its variants. Deleting an already deleted product is NOT
 * idempotent: it reports NotFoundError. Refused while any of its variants
 * still holds physical stock or active reservations: the inventory must be
 * emptied first.
 */
export class DeleteProduct {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly inventory: InventoryReadRepository,
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
      // Stock guard INSIDE the transaction: the read locks the variant rows so
      // a concurrent inventory mutation of the same variants serializes with
      // this delete instead of racing it.
      const variantInternalIds = (
        await this.reads
          .withExecutor(exec)
          .listVariantsOfProduct(requireInternalId(product.id))
      ).map((variant) => requireInternalId(variant.id));
      if (
        await this.inventory.hasStockOrActiveReservations(
          exec,
          variantInternalIds,
          new Date().toISOString(),
        )
      ) {
        throw new ConflictError(
          "Product has variants with physical stock or active reservations",
          ErrorCode.VARIANT_HAS_STOCK,
          undefined,
          undefined,
        );
      }

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

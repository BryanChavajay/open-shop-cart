import { Variant } from "../../domain/catalog/entities/product-variant.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { requireInternalId } from "./shared/entity-ids.js";
import { findVariantWithProduct } from "./shared/variant-with-product.js";

export interface DeleteVariantCommand {
  actor: CatalogActor;
  publicId: string;
  productPublicId?: string;
}

/**
 * Soft-deletes a variant (its SKU is never released or reused). Refused when
 * the variant is the only active, non-deleted variant of an ACTIVE product:
 * the product must be deactivated first. Deleting an already deleted variant
 * reports NotFoundError.
 */
export class DeleteVariant {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: DeleteVariantCommand): Promise<void> {
    const initial = await findVariantWithProduct(this.reads, command.publicId, command.productPublicId);
    await this.unitOfWork.run(async (exec) => {
    await this.writes.lockProduct(exec, initial.variant.productId);
    const reads = this.reads.withExecutor(exec);
    const { variant: variantState, product } = await findVariantWithProduct(reads, command.publicId, command.productPublicId);
    const variantInternalId = requireInternalId(variantState.id);

    const variants = await reads.listVariantsOfProduct(variantState.productId);
    const activeVariants = variants.filter((variant) => variant.isActive);
    if (product.isActive && variantState.isActive && activeVariants.length <= 1) {
      throw new ConflictError(
        "cannot delete the only active variant of an active product; deactivate the product first",
        ErrorCode.EMPTY_CATALOG_COLLECTION,
        undefined,
        undefined,
      );
    }

    const variant = Variant.restore(variantState);

      await this.writes.softDeleteVariant(exec, variantInternalId);
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Variant",
            entityIdentifier: variant.publicId,
            action: AuditAction.DELETE,
            previousValues: {
              sku: variant.sku,
              name: variant.name,
              unitPrice: variant.unitPrice,
              sortOrder: variant.sortOrder,
              isActive: variant.isActive,
            },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

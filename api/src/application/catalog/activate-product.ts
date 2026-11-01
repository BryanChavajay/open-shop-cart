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

export interface ActivateProductCommand {
  actor: CatalogActor;
  publicId: string;
}

/**
 * Validates publication against a transactionally locked product and its variants.
 */
export class ActivateProduct {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: ActivateProductCommand): Promise<void> {
    const state = await this.reads.findProductStateByPublicId(command.publicId);
    if (state === null || state.isDeleted) {
      throw new NotFoundError(
        "Product not found",
        undefined,
        undefined,
        undefined,
      );
    }

    const productId = requireInternalId(state.id);
    await this.unitOfWork.run(async (exec) => {
      await this.writes.lockProduct(exec, productId);
      const reads = this.reads.withExecutor(exec);
      const current = await reads.findProductStateByInternalId(productId);
      if (current === null || current.isDeleted) {
        throw new NotFoundError("Product not found", undefined, undefined, undefined);
      }
      const variants = await reads.listVariantsOfProduct(productId);
      const product = Product.restore(current);
      product.activate(variants.filter((variant) => variant.isActive).map((variant) => variant.coverImageId));
      await this.writes.saveProduct(exec, product);
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Product",
            entityIdentifier: product.publicId,
            action: AuditAction.UPDATE,
            previousValues: { isActive: current.isActive },
            newValues: { isActive: true },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

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

export interface DeactivateProductCommand {
  actor: CatalogActor;
  publicId: string;
}

/** Deactivates a product without removing it or any of its variants. */
export class DeactivateProduct {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: DeactivateProductCommand): Promise<void> {
    const state = await this.reads.findProductStateByPublicId(command.publicId);
    if (state === null || state.isDeleted) {
      throw new NotFoundError(
        "Product not found",
        undefined,
        undefined,
        undefined,
      );
    }

    const product = Product.restore(state);
    product.deactivate();

    await this.unitOfWork.run(async (exec) => {
      await this.writes.saveProduct(exec, product);
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Product",
            entityIdentifier: product.publicId,
            action: AuditAction.DEACTIVATE,
            previousValues: { isActive: true },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

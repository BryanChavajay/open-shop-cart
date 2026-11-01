import { Product } from "../../domain/catalog/entities/product.entity.js";
import type { UpdateProductData } from "../../domain/catalog/entities/product.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { requireInternalId } from "./shared/entity-ids.js";

export interface UpdateProductCommand {
  actor: CatalogActor;
  productPublicId: string;
  name?: string;
  description?: string;
  /** Public identifier of the new category; must exist, be active and non-deleted. */
  categoryPublicId?: string;
  /** Public identifier of the new brand; must exist, be active and non-deleted. */
  brandPublicId?: string;
}

/**
 * Updates the basic data of a product. At least one field is required. Changing
 * the activation state is NOT done here: use activate-product / deactivate-product.
 */
export class UpdateProduct {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: UpdateProductCommand): Promise<void> {
    if (
      command.name === undefined &&
      command.description === undefined &&
      command.categoryPublicId === undefined &&
      command.brandPublicId === undefined
    ) {
      throw new BusinessRuleViolation(
        "At least one field must be provided",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }

    const state = await this.reads.findProductStateByPublicId(
      command.productPublicId,
    );
    // Logically deleted products are not addressable in this iteration.
    if (state === null || state.isDeleted) {
      throw new NotFoundError(
        "Product not found",
        undefined,
        undefined,
        undefined,
      );
    }

    let categoryId: number | undefined;
    let brandId: number | undefined;

    if (command.categoryPublicId !== undefined) {
      const category = await this.reads.findCategoryByPublicId(
        command.categoryPublicId,
      );
      if (category === null || category.isDeleted) {
        throw new NotFoundError(
          "Category not found",
          undefined,
          undefined,
          undefined,
        );
      }
      if (!category.isActive) {
        throw new ConflictError(
          "category is inactive",
          ErrorCode.INVALID_CATALOG_ENTITY_STATE,
          undefined,
          undefined,
        );
      }
      categoryId = category.id;
    }

    if (command.brandPublicId !== undefined) {
      const brand = await this.reads.findBrandByPublicId(
        command.brandPublicId,
      );
      if (brand === null || brand.isDeleted) {
        throw new NotFoundError(
          "Brand not found",
          undefined,
          undefined,
          undefined,
        );
      }
      if (!brand.isActive) {
        throw new ConflictError(
          "brand is inactive",
          ErrorCode.INVALID_CATALOG_ENTITY_STATE,
          undefined,
          undefined,
        );
      }
      brandId = brand.id;
    }

    // Under exactOptionalPropertyTypes only real values are assigned.
    const data: UpdateProductData = {};
    if (command.name !== undefined) {
      data.name = command.name;
    }
    if (command.description !== undefined) {
      data.description = command.description;
    }
    if (categoryId !== undefined) {
      data.categoryId = categoryId;
    }
    if (brandId !== undefined) {
      data.brandId = brandId;
    }
    await this.unitOfWork.run(async (exec) => {
      const productId = requireInternalId(state.id);
      await this.writes.lockProduct(exec, productId);
      const previous = await this.reads.withExecutor(exec).findProductStateByInternalId(productId);
      if (previous === null || previous.isDeleted) throw new NotFoundError("Product not found", undefined, undefined, undefined);
      const product = Product.restore(previous);
      product.update(data);
      const current = product.toSnapshot();
      await this.writes.saveProduct(exec, product);
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Product",
            entityIdentifier: product.publicId,
            action: AuditAction.UPDATE,
            previousValues: {
              name: previous.name,
              description: previous.description,
              categoryId: previous.categoryId,
              brandId: previous.brandId,
            },
            newValues: {
              name: current.name,
              description: current.description,
              categoryId: current.categoryId,
              brandId: current.brandId,
            },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

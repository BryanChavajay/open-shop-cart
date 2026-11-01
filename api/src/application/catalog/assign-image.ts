import type { CatalogReadRepository, CatalogWriteRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { requireInternalId } from "./shared/entity-ids.js";
import { Product } from "../../domain/catalog/entities/product.entity.js";
import { Variant } from "../../domain/catalog/entities/product-variant.entity.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { findVariantWithProduct } from "./shared/variant-with-product.js";

interface AssignCoverCommand { actor: CatalogActor; publicId: string; imagePublicId: string | null; productPublicId?: string; }

/** Assigns or removes a product's cover image. */
export class AssignProductCover {
  constructor(private readonly reads: CatalogReadRepository, private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork, private readonly audit: AuditRepository) {}
  async execute(command: AssignCoverCommand): Promise<void> {
    const product = await this.reads.findProductStateByPublicId(command.publicId);
    if (product === null || product.isDeleted) throw new NotFoundError("Product not found", undefined, undefined, undefined);
    const productId = requireInternalId(product.id);
    if (command.imagePublicId === null && product.isActive) {
      throw new ConflictError("An active product must have a cover image", ErrorCode.EMPTY_CATALOG_COLLECTION, undefined, undefined);
    }
    const image = command.imagePublicId === null ? null : await this.reads.findImageByPublicId(command.imagePublicId);
    if (command.imagePublicId !== null && image === null) throw new NotFoundError("Image not found", undefined, undefined, undefined);
    const imageId = image === null ? null : requireInternalId(image.id);
    await this.unitOfWork.run(async (exec) => {
      await this.writes.lockProduct(exec, productId);
      const current = await this.reads.withExecutor(exec).findProductStateByInternalId(productId);
      if (current === null || current.isDeleted) throw new NotFoundError("Product not found", undefined, undefined, undefined);
      const entity = Product.restore(current);
      entity.assignCover(imageId);
      await this.writes.setProductCover(exec, productId, imageId);
      await this.audit.append(auditEntryForCatalog({ entityType: "Product", entityIdentifier: product.publicId,
        action: AuditAction.UPDATE, previousValues: { coverImageId: current.coverImageId },
        newValues: { coverImageId: imageId } }, command.actor), exec);
    });
  }
}

/** Assigns or removes a variant's cover image. */
export class AssignVariantCover {
  constructor(private readonly reads: CatalogReadRepository, private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork, private readonly audit: AuditRepository) {}
  async execute(command: AssignCoverCommand): Promise<void> {
    const { variant, product } = await findVariantWithProduct(this.reads, command.publicId, command.productPublicId);
    const variantId = requireInternalId(variant.id);
    if (command.imagePublicId === null && product.isActive && variant.isActive) {
      throw new ConflictError("An active variant of an active product must have a cover image", ErrorCode.EMPTY_CATALOG_COLLECTION, undefined, undefined);
    }
    const image = command.imagePublicId === null ? null : await this.reads.findImageByPublicId(command.imagePublicId);
    if (command.imagePublicId !== null && image === null) throw new NotFoundError("Image not found", undefined, undefined, undefined);
    const imageId = image === null ? null : requireInternalId(image.id);
    await this.unitOfWork.run(async (exec) => {
      await this.writes.lockProduct(exec, variant.productId);
      const current = await findVariantWithProduct(this.reads.withExecutor(exec), command.publicId, command.productPublicId);
      const entity = Variant.restore(current.variant);
      entity.assignCover(imageId, current.product.isActive);
      await this.writes.setVariantCover(exec, variantId, imageId);
      await this.audit.append(auditEntryForCatalog({ entityType: "Variant", entityIdentifier: variant.publicId,
        action: AuditAction.UPDATE, previousValues: { coverImageId: current.variant.coverImageId },
        newValues: { coverImageId: imageId } }, command.actor), exec);
    });
  }
}

/** Replaces the ordered carousel; cover duplication is skipped in read models. */
export class SetVariantCarousel {
  constructor(private readonly reads: CatalogReadRepository, private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork, private readonly audit: AuditRepository) {}
  async execute(command: { actor: CatalogActor; publicId: string; productPublicId?: string; imagePublicIds: string[] }): Promise<void> {
    const { variant } = await findVariantWithProduct(this.reads, command.publicId, command.productPublicId);
    const variantId = requireInternalId(variant.id);
    const unique = [...new Set(command.imagePublicIds.map((id) => id.toLowerCase()))];
    if (unique.length !== command.imagePublicIds.length) {
      throw new BusinessRuleViolation("An image cannot appear twice in the carousel", ErrorCode.INVALID_INPUT, "imagePublicIds", undefined);
    }
    const images = await Promise.all(unique.map((id) => this.reads.findImageByPublicId(id)));
    if (images.some((image) => image === null)) throw new NotFoundError("Image not found", undefined, undefined, undefined);
    const imageIds = images.map((image) => requireInternalId(image!.id));
    await this.unitOfWork.run(async (exec) => {
      await this.writes.lockProduct(exec, variant.productId);
      const reads = this.reads.withExecutor(exec);
      await findVariantWithProduct(reads, command.publicId, command.productPublicId);
      const previous = await reads.listVariantCarousel(variantId);
      await this.writes.setVariantCarousel(exec, variantId, imageIds);
      await this.audit.append(auditEntryForCatalog({ entityType: "Variant", entityIdentifier: variant.publicId,
        action: AuditAction.UPDATE,
        previousValues: { carouselImagePublicIds: previous.map((item) => item.image.publicId) },
        newValues: { carouselImagePublicIds: unique } }, command.actor), exec);
    });
  }
}

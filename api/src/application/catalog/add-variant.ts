import { Variant } from "../../domain/catalog/entities/product-variant.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { SkuGenerator } from "../../domain/shared/interfaces/providers/sku-generator.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import {
  comboKey,
  existingComboKeys,
  resolveComboValuePublicIds,
  type ComboValueRef,
} from "./shared/combo.js";
import { requireInternalId } from "./shared/entity-ids.js";

export interface AddVariantCommand {
  actor: CatalogActor;
  productPublicId: string;
  name: string;
  unitCost?: number | null | undefined;
  unitPrice: number;
  /** Defaults to 1. */
  sortOrder?: number | undefined;
  /** Defaults to true; the active-state rule is validated by the product use cases. */
  isActive?: boolean | undefined;
  /** Optional uploaded image to assign as the new variant's cover. */
  imagePublicId?: string | undefined;
  optionValues: ComboValueRef[];
}

/**
 * Adds a new variant to a non-deleted product. The combo must select exactly
 * one value per option of the product and must not repeat the combination of
 * any other non-deleted variant. The SKU is generated here; a persistence-level
 * SKU collision surfaces as a DuplicateKeyError (409) via the sql-error mapping.
 */
export class AddVariant {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly skuGenerator: SkuGenerator,
  ) {}

  async execute(command: AddVariantCommand): Promise<{ publicId: string }> {
    const product = await this.reads.findProductStateByPublicId(
      command.productPublicId,
    );
    if (product === null || product.isDeleted) {
      throw new NotFoundError(
        "Product not found",
        undefined,
        undefined,
        undefined,
      );
    }
    const productId = requireInternalId(product.id);
    const coverImage = command.imagePublicId === undefined ? null : await this.reads.findImageByPublicId(command.imagePublicId);
    if (command.imagePublicId !== undefined && coverImage === null) {
      throw new NotFoundError("Image not found", undefined, undefined, undefined);
    }
    if (product.isActive && (command.isActive ?? true) && coverImage === null) {
      throw new ConflictError("An active variant of an active product must have a cover image", ErrorCode.INVALID_CATALOG_ENTITY_STATE, undefined, undefined);
    }
    const detail = await this.reads.findProductDetailByPublicId(command.productPublicId);
    if (detail === null || detail.isDeleted) {
      throw new NotFoundError("Product not found", undefined, undefined, undefined);
    }

    // Combos must match the product's options and stay unique among variants.
    const options = await this.reads.listOptionsOfProduct(productId);
    const orderedValuePublicIds = resolveComboValuePublicIds(
      command.optionValues,
      options,
    );
    if (options.length > 0) {
      const variants = await this.reads.listVariantsOfProduct(productId);
      const taken = await existingComboKeys(
        this.reads,
        variants.map((variant) => requireInternalId(variant.id)),
      );
      const combo = comboKey(orderedValuePublicIds);
      if (taken.has(combo)) {
        throw new ConflictError(
          "A variant of this product already combines the same option values",
          ErrorCode.DUPLICATE_VARIANT_COMBO,
          undefined,
          undefined,
        );
      }
    }

    const variant = Variant.create({
      publicId: this.identifiers.newPublicId(),
      productId,
      coverImageId: coverImage === null ? null : requireInternalId(coverImage.id),
      sku: this.skuGenerator.generateSku({
        categoryName: detail.categoryName,
        brandName: detail.brandName,
        productName: detail.name,
      }),
      name: command.name,
      unitCost: command.unitCost ?? null,
      unitPrice: command.unitPrice,
      sortOrder: command.sortOrder ?? 1,
      isActive: command.isActive ?? true,
    });

    // Additional map when the product has options (value public id -> id in DB).
    const valueIds = new Map<string, number>();
    for (const option of options) {
      for (const value of option.values) {
        if (value.id !== null) {
          valueIds.set(value.publicId, value.id);
        }
      }
    }

    await this.unitOfWork.run(async (exec) => {
      await this.writes.lockProduct(exec, productId);
      const current = await this.reads.withExecutor(exec).findProductStateByInternalId(productId);
      if (current === null || current.isDeleted) throw new NotFoundError("Product not found", undefined, undefined, undefined);
      if (current.isActive && variant.isActive && coverImage === null) {
        throw new ConflictError("An active variant of an active product must have a cover image", ErrorCode.INVALID_CATALOG_ENTITY_STATE, undefined, undefined);
      }
      const variantInternalId = await this.writes.saveVariant(
        exec,
        variant,
        productId,
      );
      if (coverImage !== null) {
        await this.writes.setVariantCover(exec, variantInternalId, requireInternalId(coverImage.id));
      }
      for (const valuePublicId of orderedValuePublicIds) {
        const valueInternalId = valueIds.get(valuePublicId);
        if (valueInternalId === undefined) {
          throw new BusinessRuleViolation(
            "The option value does not belong to this product",
            ErrorCode.INVALID_INPUT,
            undefined,
            undefined,
          );
        }
        await this.writes.addComboValue(exec, variantInternalId, valueInternalId);
      }
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Variant",
            entityIdentifier: variant.publicId,
            action: AuditAction.CREATE,
            newValues: {
              sku: variant.sku,
              name: variant.name,
              unitPrice: variant.unitPrice,
              sortOrder: variant.sortOrder,
            },
          },
          command.actor,
        ),
        exec,
      );
    });

    return { publicId: variant.publicId };
  }
}

import { Variant } from "../../domain/catalog/entities/product-variant.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
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
import { findVariantWithProduct } from "./shared/variant-with-product.js";

export interface UpdateVariantCommand {
  actor: CatalogActor;
  variantPublicId: string;
  productPublicId?: string;
  isActive?: boolean | undefined;
  name?: string | undefined;
  unitCost?: number | null | undefined;
  unitPrice?: number | undefined;
  sortOrder?: number | undefined;
  /** When provided, the combo is replaced entirely. */
  optionValues?: ComboValueRef[] | undefined;
}

/**
 * Updates the commercial data of a variant (and optionally replaces its combo).
 * Variants of a logically deleted product are not addressable. SKU and product
 * assignment are immutable.
 */
export class UpdateVariant {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
  ) {}

  async execute(command: UpdateVariantCommand): Promise<void> {
    if (
      command.name === undefined &&
      command.unitCost === undefined &&
      command.unitPrice === undefined &&
      command.sortOrder === undefined &&
      command.isActive === undefined &&
      command.optionValues === undefined
    ) {
      throw new BusinessRuleViolation(
        "At least one field must be provided",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }

    const initial = await findVariantWithProduct(this.reads, command.variantPublicId, command.productPublicId);
    await this.unitOfWork.run(async (exec) => {
    await this.writes.lockProduct(exec, initial.variant.productId);
    const reads = this.reads.withExecutor(exec);
    const { variant: variantState, product } = await findVariantWithProduct(reads, command.variantPublicId, command.productPublicId);
    const variantInternalId = requireInternalId(variantState.id);
    const productId = variantState.productId;

    const previous = variantState;
    let newComboValuePublicIds: string[] | null = null;

    if (command.optionValues !== undefined) {
      const options = await reads.listOptionsOfProduct(productId);
      newComboValuePublicIds = resolveComboValuePublicIds(
        command.optionValues,
        options,
      );
      if (options.length > 0) {
        const others = await reads.listVariantsOfProduct(productId);
        const taken = await existingComboKeys(
          reads,
          others
            .filter((variant) => variant.publicId !== variantState.publicId)
            .map((variant) => requireInternalId(variant.id)),
        );
        const combo = comboKey(newComboValuePublicIds);
        if (taken.has(combo)) {
          throw new ConflictError(
            "Another variant of this product already combines the same option values",
            ErrorCode.DUPLICATE_VARIANT_COMBO,
            undefined,
            undefined,
          );
        }
      }
    }

    const variant = Variant.restore(variantState);
    if (command.isActive === true) {
      if (product.isActive && variantState.coverImageId === null) {
        throw new ConflictError("An active variant of an active product must have a cover image", ErrorCode.INVALID_CATALOG_ENTITY_STATE, undefined, undefined);
      }
      variant.activate();
    } else if (command.isActive === false) {
      const variants = await reads.listVariantsOfProduct(productId);
      if (product.isActive && variantState.isActive && variants.filter((item) => item.isActive).length <= 1) {
        throw new ConflictError("Cannot deactivate the last active variant of an active product", ErrorCode.EMPTY_CATALOG_COLLECTION, undefined, undefined);
      }
      variant.deactivate();
    }
    variant.update({
      name: command.name ?? previous.name,
      unitCost: command.unitCost !== undefined ? command.unitCost : previous.unitCost,
      unitPrice: command.unitPrice ?? previous.unitPrice,
      sortOrder: command.sortOrder ?? previous.sortOrder,
    });

    // Map of value public ids -> internal ids of the product's options.
    const valueIds = new Map<string, number>();
    for (const option of await reads.listOptionsOfProduct(productId)) {
      for (const value of option.values) {
        if (value.id !== null) {
          valueIds.set(value.publicId, value.id);
        }
      }
    }

      await this.writes.saveVariant(exec, variant, productId);
      if (newComboValuePublicIds !== null) {
        await this.writes.clearCombo(exec, variantInternalId);
        for (const valuePublicId of newComboValuePublicIds) {
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
      }
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Variant",
            entityIdentifier: variant.publicId,
            action: AuditAction.UPDATE,
            previousValues: {
              name: previous.name,
              unitCost: previous.unitCost,
              unitPrice: previous.unitPrice,
              sortOrder: previous.sortOrder,
              isActive: previous.isActive,
            },
            newValues: {
              name: variant.name,
              unitCost: variant.unitCost,
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

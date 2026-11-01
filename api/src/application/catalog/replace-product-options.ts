import { ProductOption, type ProductOptionSnapshot } from "../../domain/catalog/entities/product-option.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { requireInternalId } from "./shared/entity-ids.js";

export interface ReplaceProductOptionsValueCommand {
  value: string;
  /** Defaults to the 1-based position of the value inside the option. */
  sortOrder?: number | undefined;
}

export interface ReplaceProductOptionsOptionCommand {
  name: string;
  values: ReplaceProductOptionsValueCommand[];
}

export interface ReplaceProductOptionsCommand {
  actor: CatalogActor;
  productPublicId: string;
  /** The full new option set of the product. An empty list clears every option ahead. */
  options: ReplaceProductOptionsOptionCommand[];
}

/**
 * Replaces the whole option set of a product: the current options, values and
 * combos are purged and the new ones are created. Only allowed while the
 * product has NO non-deleted variants (their combos would be orphaned);
 * otherwise reports a conflict.
 */
export class ReplaceProductOptions {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
  ) {}

  async execute(command: ReplaceProductOptionsCommand): Promise<void> {
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

    const variants = await this.reads.listVariantsOfProduct(productId);
    if (variants.length > 0) {
      throw new ConflictError(
        "cannot replace the options of a product with variants",
        ErrorCode.INVALID_CATALOG_ENTITY_STATE,
        undefined,
        undefined,
      );
    }

    const previousOptions = await this.reads.listOptionsOfProduct(productId);

    // --- New options built and validated in memory ---
    const optionNames = new Set<string>();
    const pendingOptions: { snapshot: ProductOptionSnapshot; sortOrder: number }[] = [];
    for (const [optionIndex, optionCommand] of command.options.entries()) {
      const name = optionCommand.name.trim();
      if (optionNames.has(name)) {
        throw new ConflictError(
          "The product already has an option with the same name",
          ErrorCode.DUPLICATE_CATALOG_NAME,
          undefined,
          undefined,
        );
      }
      optionNames.add(name);

      const valueTexts = new Set<string>();
      const values = optionCommand.values.map((valueCommand, valueIndex) => {
        const text = valueCommand.value.trim();
        if (text.length === 0) {
          throw new BusinessRuleViolation(
            "The required field value was not provided",
            ErrorCode.REQUIRED_FIELD_MISSING,
            "value",
            undefined,
          );
        }
        if (valueTexts.has(text)) {
          throw new ConflictError(
            "The option already has a value with the same text",
            ErrorCode.DUPLICATE_OPTION_VALUE,
            undefined,
            undefined,
          );
        }
        valueTexts.add(text);
        return {
          id: null,
          publicId: this.identifiers.newPublicId(),
          value: text,
          sortOrder: valueCommand.sortOrder ?? valueIndex + 1,
        };
      });
      if (values.length === 0) {
        throw new BusinessRuleViolation(
          "Each option must have at least one value",
          ErrorCode.EMPTY_CATALOG_COLLECTION,
          undefined,
          undefined,
        );
      }
      const option = ProductOption.create({
        id: null,
        publicId: this.identifiers.newPublicId(),
        name,
        values,
      });
      pendingOptions.push({
        snapshot: option.toSnapshot(),
        sortOrder: optionIndex + 1,
      });
    }

    await this.unitOfWork.run(async (exec) => {
      // Purges options, values and combos (procedure owns a nested transaction).
      await this.writes.replaceOptionsOfProduct(exec, productId);
      for (const option of pendingOptions) {
        const optionInternalId = await this.writes.saveOption(exec, productId, {
          publicId: option.snapshot.publicId,
          name: option.snapshot.name,
          sortOrder: option.sortOrder,
        });
        for (const value of option.snapshot.values) {
          await this.writes.saveOptionValue(exec, optionInternalId, {
            publicId: value.publicId,
            value: value.value,
            sortOrder: value.sortOrder,
          });
        }
      }
      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Product",
            entityIdentifier: product.publicId,
            action: AuditAction.UPDATE,
            previousValues: {
              options: previousOptions.map((option) => option.name),
            },
            newValues: {
              options: pendingOptions.map((option) => option.snapshot.name),
            },
          },
          command.actor,
        ),
        exec,
      );
    });
  }
}

import { Product } from "../../domain/catalog/entities/product.entity.js";
import { ProductOption } from "../../domain/catalog/entities/product-option.entity.js";
import { Variant } from "../../domain/catalog/entities/product-variant.entity.js";
import type {
  CatalogReadRepository,
  CatalogWriteRepository,
} from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { SkuGenerator } from "../../domain/shared/interfaces/providers/sku-generator.js";
import type { TaxCalculator } from "../../domain/shared/interfaces/providers/tax-calculator.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { FullAdminProductReadModel } from "../../domain/catalog/readmodels/product-admin.read-model.js";
import type { ProductOptionSnapshot } from "../../domain/catalog/entities/product-option.entity.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { comboKey, resolveComboValuePublicIds } from "./shared/combo.js";
import { assembleFullProduct } from "./shared/product-assembler.js";

export interface CreateProductOptionValueCommand {
  value: string;
  /** Defaults to the 1-based position of the value inside the option. */
  sortOrder?: number | undefined;
}

export interface CreateProductOptionCommand {
  name: string;
  values: CreateProductOptionValueCommand[];
}

export interface CreateProductVariantCommand {
  name: string;
  unitCost?: number | null | undefined;
  unitPrice: number;
  /** Defaults to the 1-based position of the variant inside the command. */
  sortOrder?: number | undefined;
  /** Positional combo: 1-based indexes matching the `options` and `values` arrays. */
  optionValues: CreateProductComboRef[];
}

/**
 * Positional reference used while creating a product: the options are brand
 * new and their public ids are assigned by this use case, so the command
 * selects each value by its 1-based position (option then value).
 */
export interface CreateProductComboRef {
  optionIndex: number;
  valueIndex: number;
}

/**
 * Translates positional references into public-id references against the
 * options validated in this request. Throws when an index does not exist or
 * when the same option is selected twice in a single combo.
 */
function resolvePositionalComboRefs(
  refs: readonly CreateProductComboRef[],
  pendingOptions: readonly PendingOption[],
): { optionPublicId: string; valuePublicId: string }[] {
  const selected = new Map<number, string>();
  for (const ref of refs) {
    if (selected.has(ref.optionIndex)) {
      throw new BusinessRuleViolation(
        "The variant selects more than one value for the same option",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    const option = pendingOptions[ref.optionIndex - 1];
    if (option === undefined) {
      throw new BusinessRuleViolation(
        `The option index ${ref.optionIndex} does not exist in the request`,
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    const value = option.snapshot.values[ref.valueIndex - 1];
    if (value === undefined) {
      throw new BusinessRuleViolation(
        `The value index ${ref.valueIndex} does not exist inside the option ${ref.optionIndex}`,
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }
    selected.set(ref.optionIndex, value.publicId);
  }
  return [...selected].map(([optionIndex, valuePublicId]) => ({
    optionPublicId: pendingOptions[optionIndex - 1]!.snapshot.publicId,
    valuePublicId,
  }));
}

export interface CreateProductCommand {
  actor: CatalogActor;
  /** Public identifier of an active, non-deleted category. */
  categoryId: string;
  /** Public identifier of an active, non-deleted brand. */
  brandId: string;
  name: string;
  description: string;
  options: CreateProductOptionCommand[];
  /**
   * At least one variant is required. For products without options, send a
   * single variant (typically named "Standard") with an empty `optionValues`
   * list; its `unitPrice` is the price of the standard variant. The product
   * always starts INACTIVE and every new variant starts ACTIVE.
   */
  variants: CreateProductVariantCommand[];
}

/** Working data of an option pending persistence. */
interface PendingOption {
  /** Validated snapshot (trimmed) used both for saving and combo mapping. */
  snapshot: ProductOptionSnapshot;
  /** Display order of the option inside the product. */
  sortOrder: number;
}

/** Working data of a variant pending persistence. */
interface PendingVariant {
  entity: Variant | null;
  orderedValuePublicIds: string[];
  name: string;
  unitCost: number | null;
  unitPrice: number;
  sortOrder: number;
  publicId: string;
}

/**
 * Creates a product (always inactive) together with its options, values and
 * variants, inside a single transaction.
 *
 * Every rule that does not need the database is validated before the engine
 * opens the transaction. Persistence-level duplicates surface automatically:
 * the unique SKU index violation is mapped to a DuplicateKeyError (409) by the
 * sql-error mapping (no exception is captured here), and the option/value
 * procedures raise Throw 5000x errors (only reachable through races, because
 * this use case validates the same rules in memory first).
 */
export class CreateProduct {
  constructor(
    private readonly reads: CatalogReadRepository,
    private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly skuGenerator: SkuGenerator,
    private readonly taxCalculator: TaxCalculator,
  ) {}

  async execute(
    command: CreateProductCommand,
  ): Promise<FullAdminProductReadModel> {
    // --- Prerequisites validated before opening the transaction ---
    const category = await this.reads.findCategoryByPublicId(command.categoryId);
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

    const brand = await this.reads.findBrandByPublicId(command.brandId);
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

    if (command.variants.length === 0) {
      throw new BusinessRuleViolation(
        "At least one variant is required; use a single 'Standard' variant for products without options",
        ErrorCode.INVALID_INPUT,
        undefined,
        undefined,
      );
    }

    // --- Options built and validated in memory (public ids assigned here) ---
    const optionNames = new Set<string>();
    const pendingOptions: PendingOption[] = [];
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
      // The entity validates field-level rules (lengths, trim, sort orders).
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

    // --- Variants built in memory: every combo must differ ---
    const optionSnapshots = pendingOptions.map((option) => option.snapshot);
    const usedCombos = new Set<string>();
    const pendingVariants: PendingVariant[] = [];
    for (const [variantIndex, variantCommand] of command.variants.entries()) {
      const orderedValuePublicIds = resolveComboValuePublicIds(
        resolvePositionalComboRefs(variantCommand.optionValues, pendingOptions),
        optionSnapshots,
      );
      if (optionSnapshots.length > 0) {
        const combo = comboKey(orderedValuePublicIds);
        if (usedCombos.has(combo)) {
          throw new ConflictError(
            "Two variants combine the same option values",
            ErrorCode.DUPLICATE_VARIANT_COMBO,
            undefined,
            undefined,
          );
        }
        usedCombos.add(combo);
      }
      pendingVariants.push({
        entity: null,
        orderedValuePublicIds,
        publicId: this.identifiers.newPublicId(),
        name: variantCommand.name,
        unitCost: variantCommand.unitCost ?? null,
        unitPrice: variantCommand.unitPrice,
        sortOrder: variantCommand.sortOrder ?? variantIndex + 1,
      });
    }

    const product = Product.create({
      publicId: this.identifiers.newPublicId(),
      categoryId: category.id,
      brandId: brand.id,
      name: command.name,
      description: command.description,
      // A product always starts inactive; activation is a separate use case.
      isActive: false,
    });

    // --- Transaction: product -> options/values -> variants/combos -> audit ---
    await this.unitOfWork.run(async (exec) => {
      const productId = await this.writes.saveProduct(exec, product);

      const valueInternalIds = new Map<string, number>();
      for (const option of pendingOptions) {
        const optionInternalId = await this.writes.saveOption(exec, productId, {
          publicId: option.snapshot.publicId,
          name: option.snapshot.name,
          sortOrder: option.sortOrder,
        });
        for (const value of option.snapshot.values) {
          const valueInternalId = await this.writes.saveOptionValue(
            exec,
            optionInternalId,
            {
              publicId: value.publicId,
              value: value.value,
              sortOrder: value.sortOrder,
            },
          );
          valueInternalIds.set(value.publicId, valueInternalId);
        }
      }

      for (const pending of pendingVariants) {
        const variant = Variant.create({
          publicId: pending.publicId,
          productId,
          // ExistenciaFisica stays at 0: the inventory module owns it.
          sku: this.skuGenerator.generateSku({
            categoryName: category.name,
            brandName: brand.name,
            productName: product.name,
          }),
          name: pending.name,
          unitCost: pending.unitCost,
          unitPrice: pending.unitPrice,
          sortOrder: pending.sortOrder,
          isActive: true,
        });
        pending.entity = variant;
        const variantInternalId = await this.writes.saveVariant(
          exec,
          variant,
          productId,
        );
        for (const valuePublicId of pending.orderedValuePublicIds) {
          const valueInternalId = valueInternalIds.get(valuePublicId);
          if (valueInternalId === undefined) {
            throw new Error(
              "The option value was not persisted in this transaction",
            );
          }
          await this.writes.addComboValue(
            exec,
            variantInternalId,
            valueInternalId,
          );
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
      }

      await this.audit.append(
        auditEntryForCatalog(
          {
            entityType: "Product",
            entityIdentifier: product.publicId,
            action: AuditAction.CREATE,
            newValues: {
              name: product.name,
              description: product.description,
              isActive: product.isActive,
            },
          },
          command.actor,
        ),
        exec,
      );
    });

    // --- Fresh read-back outside the transaction ---
    const full = await assembleFullProduct(
      this.reads,
      this.taxCalculator,
      product.publicId,
    );
    if (full === null) {
      throw new NotFoundError(
        "Product not found",
        undefined,
        undefined,
        undefined,
      );
    }
    return full;
  }
}

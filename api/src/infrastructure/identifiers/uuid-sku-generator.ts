import { v7 } from "uuid";
import type { SkuGenerator } from "../../domain/shared/interfaces/providers/sku-generator.js";

/**
 * SKU generator producing globally unique candidates prefixed with "SKU-".
 * "SKU-" (4 chars) + a 36-character UUID v7 stays under the 64-char column
 * limit. Each SKU is built from a new identifier: existing ids are never
 * reused; uniqueness is finally enforced at persistence time.
 */
export class UuidSkuGenerator implements SkuGenerator {
  generateSku(): string {
    return `SKU-${v7()}`;
  }
}

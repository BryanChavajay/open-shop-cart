import { randomInt } from "node:crypto";
import type { SkuGenerationContext, SkuGenerator } from "../../domain/shared/interfaces/providers/sku-generator.js";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function initials(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2).padEnd(2, "X");
}

/** Human-readable prefix and cryptographically random, unambiguous suffix. */
export class InitialsSkuGenerator implements SkuGenerator {
  generateSku(context: SkuGenerationContext): string {
    let suffix = "";
    for (let index = 0; index < 8; index++) {
      suffix += ALPHABET.charAt(randomInt(ALPHABET.length));
    }
    return initials(context.categoryName) + initials(context.brandName) +
      initials(context.productName) + suffix;
  }
}

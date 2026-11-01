import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Metadata of an independently stored, immutable image. */
export interface ImageSnapshot {
  id: number | null;
  publicId: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  altText: string | null;
}

export class Image {
  private constructor(private readonly state: ImageSnapshot) {}

  static create(data: Omit<ImageSnapshot, "id">): Image {
    const storageKey = data.storageKey.trim();
    const contentType = data.contentType.trim();
    const altText = data.altText?.trim() || null;
    if (!storageKey || storageKey.length > 100 || !contentType || contentType.length > 50 ||
        (altText !== null && altText.length > 300) ||
        ![data.sizeBytes, data.width, data.height].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new BusinessRuleViolation("Invalid image metadata", ErrorCode.INVALID_INPUT, undefined, undefined);
    }
    return new Image({ ...data, id: null, storageKey, contentType, altText });
  }

  static restore(snapshot: ImageSnapshot): Image {
    return new Image({ ...snapshot });
  }

  setAltText(value: string | null): void {
    const altText = value?.trim() || null;
    if (altText !== null && altText.length > 300) {
      throw new BusinessRuleViolation("The alt text exceeds 300 characters", ErrorCode.INVALID_INPUT, "altText", undefined);
    }
    this.state.altText = altText;
  }

  toSnapshot(): ImageSnapshot {
    return { ...this.state };
  }
}

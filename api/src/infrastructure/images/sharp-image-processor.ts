import sharp, { type Metadata } from "sharp";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { ImageFormat } from "../../domain/catalog/enums/image-format.enum.js";
import type {
  ImageInput,
  ImageProcessor,
  ProcessedImage,
} from "../../domain/shared/interfaces/providers/image-processor.js";

/** Maximum allowed side of the processed image, in pixels. */
const MAX_DIMENSION = 1600;
/** WebP quality used for the compressed output. */
const WEBP_QUALITY = 80;

/** Real formats accepted after magic-byte verification (static images only). */
const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp"]);

function reject(message: string, code: ErrorCode): never {
  throw new BusinessRuleViolation(message, code, undefined, undefined);
}

/**
 * Image processor for product uploads backed by `sharp`.
 *
 * It verifies the real (magic-byte) format, normalizes orientation via EXIF,
 * resizes to fit 1600x1600 without enlarging, strips metadata and compresses
 * the result to a static WebP of the given quality.
 */
export class SharpImageProcessor implements ImageProcessor {
  async process(input: ImageInput): Promise<ProcessedImage> {
    let metadata: Metadata;
    try {
      metadata = await sharp(input.buffer).metadata();
    } catch {
      // The bytes cannot be parsed as any supported image at all.
      reject("The uploaded image bytes are corrupted or unreadable", ErrorCode.CORRUPTED_IMAGE);
    }

    if (metadata.format === undefined || !ACCEPTED_FORMATS.has(metadata.format)) {
      reject(
        `The uploaded image format is not supported: ${metadata.format ?? "unknown"}`,
        ErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      );
    }
    if (metadata.pages !== undefined && metadata.pages > 1) {
      // Animated images are outside the product-image pipeline.
      reject(
        "Animated images are not supported",
        ErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      );
    }

    const { data, info } = await sharp(input.buffer)
      // No arguments: rotate according to EXIF orientation, if present.
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      width: info.width,
      height: info.height,
      contentType: "image/webp",
      format: ImageFormat.WEBP,
    };
  }
}

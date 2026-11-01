import { ImageFormat } from "../../../catalog/enums/image-format.enum.js";

/** Image format accepted by the upload pipeline. */
export interface ImageInput {
  buffer: Buffer;
  format: ImageFormat;
}

/** Normalized and compressed image ready for persistence and serving. */
export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  /** MIME type (always "image/webp"). */
  contentType: string;
  format: ImageFormat.WEBP;
}

/**
 * Image normalizer for product uploads.
 *
 * The implementation validates the real (magic-byte) format, normalizes
 * orientation, strips metadata and compresses to WebP.
 */
export interface ImageProcessor {
  process(input: ImageInput): Promise<ProcessedImage>;
}

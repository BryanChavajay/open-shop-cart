/** Image as exposed by admin endpoints; the storage key feeds media serving. */
export interface ProductImageReadModel {
  /** Public identifier (UUID v7). */
  publicId: string;
  url: string;
  /** Storage key of the binary content. */
  storageKey: string;
  /** MIME type of the stored content ("image/webp"). */
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  /** Accessibility description; null when not provided. */
  altText: string | null;
}

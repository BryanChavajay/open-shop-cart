import { Image } from "../../domain/catalog/entities/image.entity.js";
import type { CatalogWriteRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { IdentifierGenerator } from "../../domain/shared/interfaces/providers/identifier-generator.js";
import type { ImageProcessor } from "../../domain/shared/interfaces/providers/image-processor.js";
import type { ImageStorage } from "../../domain/shared/interfaces/providers/image-storage.js";
import { ImageFormat } from "../../domain/catalog/enums/image-format.enum.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";

export interface UploadProductImageItem { buffer: Buffer; format: ImageFormat; altText?: string | null; }
export interface UploadProductImagesCommand { actor: CatalogActor; images: UploadProductImageItem[]; }

/** Processes and registers independent images; linking is a separate command. */
export class UploadProductImages {
  constructor(private readonly writes: CatalogWriteRepository, private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditRepository, private readonly identifiers: IdentifierGenerator,
    private readonly imageProcessor: ImageProcessor, private readonly imageStorage: ImageStorage) {}

  async execute(command: UploadProductImagesCommand): Promise<{ publicId: string }[]> {
    if (command.images.length === 0) {
      throw new BusinessRuleViolation("At least one image is required", ErrorCode.EMPTY_CATALOG_COLLECTION, undefined, undefined);
    }
    const prepared: { key: string; data: Awaited<ReturnType<ImageProcessor["process"]>> }[] = [];
    const storageKeys: string[] = [];
    try {
      for (const input of command.images) {
        const data = await this.imageProcessor.process(input);
        const key = `${this.identifiers.newPublicId()}.webp`;
        storageKeys.push(key);
        await this.imageStorage.save(key, data.buffer);
        prepared.push({ key, data });
      }
      return await this.unitOfWork.run(async (exec) => {
        const result: { publicId: string }[] = [];
        for (const [index, item] of prepared.entries()) {
          const image = Image.create({
            publicId: this.identifiers.newPublicId(), storageKey: item.key,
            contentType: item.data.contentType, sizeBytes: item.data.buffer.byteLength,
            width: item.data.width, height: item.data.height,
            altText: command.images[index]?.altText ?? null,
          });
          await this.writes.saveImage(exec, image);
          await this.audit.append(auditEntryForCatalog({
            entityType: "Image", entityIdentifier: image.toSnapshot().publicId,
            action: AuditAction.CREATE, newValues: { storageKey: item.key },
          }, command.actor), exec);
          result.push({ publicId: image.toSnapshot().publicId });
        }
        return result;
      });
    } catch (error) {
      for (const key of storageKeys) {
        try {
          await this.imageStorage.delete(key);
        } catch (cleanupError: unknown) {
          console.error("[UploadImages] Storage cleanup failed", cleanupError);
        }
      }
      throw error;
    }
  }
}

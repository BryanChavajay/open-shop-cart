import type { CatalogReadRepository, CatalogWriteRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import type { ImageStorage } from "../../domain/shared/interfaces/providers/image-storage.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { ConflictError } from "../../domain/shared/errors/conflict-error.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";
import { requireInternalId } from "./shared/entity-ids.js";

export class DeleteProductImage {
  constructor(private readonly reads: CatalogReadRepository, private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork, private readonly audit: AuditRepository,
    private readonly imageStorage: ImageStorage) {}
  async execute(command: { actor: CatalogActor; imagePublicId: string }): Promise<void> {
    const image = await this.reads.findImageByPublicId(command.imagePublicId);
    if (image === null) throw new NotFoundError("Image not found", undefined, undefined, undefined);
    if (await this.reads.hasImageReferences(requireInternalId(image.id))) {
      throw new ConflictError("The image is referenced and cannot be deleted", ErrorCode.INVALID_CATALOG_ENTITY_STATE, undefined, undefined);
    }
    await this.unitOfWork.run(async (exec) => {
      await this.writes.deleteImagePhysically(exec, image.publicId);
      await this.audit.append(auditEntryForCatalog({ entityType: "Image", entityIdentifier: image.publicId,
        action: AuditAction.DELETE, previousValues: { altText: image.altText } }, command.actor), exec);
    });
    try {
      await this.imageStorage.delete(image.storageKey);
    } catch (error: unknown) {
      console.error("[DeleteImage] Storage cleanup failed after commit", error);
    }
  }
}

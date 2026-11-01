import { Image } from "../../domain/catalog/entities/image.entity.js";
import type { CatalogReadRepository, CatalogWriteRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { AuditRepository } from "../../domain/audit/interfaces/repositories/audit.repository.js";
import { AuditAction } from "../../domain/audit/enums/audit-action.enum.js";
import { NotFoundError } from "../../domain/shared/errors/not-found.js";
import type { UnitOfWork } from "./shared/unit-of-work.js";
import type { CatalogActor } from "./shared/dependencies.js";
import { auditEntryForCatalog } from "./shared/audit.js";

export class UpdateProductImage {
  constructor(private readonly reads: CatalogReadRepository, private readonly writes: CatalogWriteRepository,
    private readonly unitOfWork: UnitOfWork, private readonly audit: AuditRepository) {}
  async execute(command: { actor: CatalogActor; imagePublicId: string; altText: string | null }): Promise<void> {
    const state = await this.reads.findImageByPublicId(command.imagePublicId);
    if (state === null) throw new NotFoundError("Image not found", undefined, undefined, undefined);
    const image = Image.restore(state);
    image.setAltText(command.altText);
    await this.unitOfWork.run(async (exec) => {
      await this.writes.updateImage(exec, image);
      await this.audit.append(auditEntryForCatalog({ entityType: "Image", entityIdentifier: state.publicId,
        action: AuditAction.UPDATE, previousValues: { altText: state.altText },
        newValues: { altText: command.altText } }, command.actor), exec);
    });
  }
}

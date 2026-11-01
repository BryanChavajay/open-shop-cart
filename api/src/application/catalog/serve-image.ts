import type { CatalogReadRepository } from "../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type { ImageStorage } from "../../domain/shared/interfaces/providers/image-storage.js";
import { requireInternalId } from "./shared/entity-ids.js";

export class ServeImage {
  constructor(private readonly reads: CatalogReadRepository, private readonly storage: ImageStorage) {}
  async execute(command: { imagePublicId: string; isAdmin: boolean }): Promise<{ contentType: string; buffer: Buffer } | null> {
    const image = await this.reads.findImageByPublicId(command.imagePublicId);
    if (image === null) return null;
    if (!command.isAdmin && !(await this.reads.canServeImagePublicly(requireInternalId(image.id)))) return null;
    const buffer = await this.storage.read(image.storageKey);
    return buffer === null ? null : { contentType: image.contentType, buffer };
  }
}

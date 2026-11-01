import type { RequestHandler, Response } from "express";
import multer from "multer";
import type { CatalogUseCases } from "../../../../application/catalog/catalog-use-cases.js";
import * as schemas from "../../../../infrastructure/dtos/zod/catalog/request.schemas.js";
import * as publicSchemas from "../../../../infrastructure/dtos/zod/catalog/public.schemas.js";
import { currentUser } from "../middleware/current-user.js";
import { NotFoundError } from "../../../../domain/shared/errors/not-found.js";
import { ImageFormat } from "../../../../domain/catalog/enums/image-format.enum.js";
import { ValidateError } from "../../../../domain/shared/errors/validate-error.js";
import type { CreateCategoryCommand } from "../../../../application/catalog/create-category.js";

type CatalogControllers = Record<
  | "createCategory" | "listCategories" | "getCategory" | "updateCategory" | "deleteCategory"
  | "createBrand" | "listBrands" | "getBrand" | "updateBrand" | "deleteBrand"
  | "listPublic" | "getPublic" | "createProduct" | "listProducts" | "getProduct"
  | "updateProduct" | "setProductActive" | "deleteProduct" | "replaceOptions"
  | "addVariant" | "updateVariant" | "deleteVariant" | "uploadImages" | "updateImage"
  | "deleteImage" | "assignProductCover" | "assignVariantCover" | "setVariantCarousel"
  | "servePublicImage" | "serveAdminImage", RequestHandler>;

function actor(res: Response) { return { id: currentUser(res).id }; }
function format(buffer: Buffer): ImageFormat {
  if (buffer.subarray(0, 2).toString("latin1") === "\xff\xd8") return ImageFormat.JPEG;
  if (buffer.subarray(0, 4).toString("latin1") === "\x89PNG") return ImageFormat.PNG;
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return ImageFormat.WEBP;
  throw new ValidateError("Solicitud inválida", undefined, "images: formato de imagen no soportado", "body");
}
function id(res: Response) { return schemas.publicIdParamsSchema.parse(res.locals.validated.params).publicId; }
function imageId(res: Response) { return schemas.imageParamsSchema.parse(res.locals.validated.params).imagePublicId; }
function notFound(message: string) { return new NotFoundError(message, undefined, undefined, undefined); }
function serve(catalog: CatalogUseCases, isAdmin: boolean): RequestHandler {
  return async (_req, res) => {
    const served = await catalog.images.serve.execute({ imagePublicId: imageId(res), isAdmin });
    if (served === null) throw notFound("Image not found");
    res.setHeader("Content-Type", served.contentType);
    res.setHeader("Cache-Control", isAdmin ? "private, no-store" : "public, max-age=86400");
    res.send(served.buffer);
  };
}
function create(useCase: { execute(command: CreateCategoryCommand): Promise<{ publicId: string }> }): RequestHandler {
  return async (_req, res) => {
    const body = res.locals.validated.body;
    const created = await useCase.execute({ ...body, actor: actor(res) });
    res.status(201).json(publicSchemas.createdCatalogEntitySchema.parse(created));
  };
}

export function createCatalogControllers(catalog: CatalogUseCases): CatalogControllers {
  const taxonomy = (group: CatalogUseCases["categories"] | CatalogUseCases["brands"]): Record<"create" | "list" | "get" | "update" | "delete", RequestHandler> => ({
    create: create(group.create),
    list: async (_req: Parameters<RequestHandler>[0], res: Response) => res.json(publicSchemas.paginatedTaxonomySchema.parse(await group.list.execute(res.locals.validated.query))),
    get: async (_req: Parameters<RequestHandler>[0], res: Response) => res.json(publicSchemas.taxonomySchema.parse(await group.get.execute({ publicId: id(res) }))),
    update: async (_req: Parameters<RequestHandler>[0], res: Response) => { await group.update.execute({ ...res.locals.validated.body, publicId: id(res), actor: actor(res) }); res.status(204).end(); },
    delete: async (_req: Parameters<RequestHandler>[0], res: Response) => { await group.delete.execute({ publicId: id(res), actor: actor(res) }); res.status(204).end(); },
  });
  return {
    createCategory: create(catalog.categories.create),
    listCategories: async (_req: Parameters<RequestHandler>[0], res: Response) => res.json(publicSchemas.paginatedTaxonomySchema.parse(await catalog.categories.list.execute(res.locals.validated.query))),
    getCategory: async (_req: Parameters<RequestHandler>[0], res: Response) => res.json(publicSchemas.taxonomySchema.parse(await catalog.categories.get.execute({ publicId: id(res) }))),
    updateCategory: async (_req: Parameters<RequestHandler>[0], res: Response) => { await catalog.categories.update.execute({ ...res.locals.validated.body, publicId: id(res), actor: actor(res) }); res.status(204).end(); },
    deleteCategory: async (_req: Parameters<RequestHandler>[0], res: Response) => { await catalog.categories.delete.execute({ publicId: id(res), actor: actor(res) }); res.status(204).end(); },
    createBrand: create(catalog.brands.create), listBrands: taxonomy(catalog.brands).list, getBrand: taxonomy(catalog.brands).get,
    updateBrand: taxonomy(catalog.brands).update, deleteBrand: taxonomy(catalog.brands).delete,
    listPublic: async (_req: Parameters<RequestHandler>[0], res: Response) => res.json(publicSchemas.paginatedPublicProductsSchema.parse(await catalog.public.list.execute(res.locals.validated.query))),
    getPublic: async (_req: Parameters<RequestHandler>[0], res: Response) => { const product = await catalog.public.get.execute({ publicId: id(res) }); if (product === null) throw notFound("Product not found"); res.json(publicSchemas.publicProductDetailSchema.parse(product)); },
    createProduct: async (_req: Parameters<RequestHandler>[0], res: Response) => res.status(201).json(publicSchemas.fullAdminProductSchema.parse(await catalog.products.create.execute({ ...res.locals.validated.body, actor: actor(res) }))),
    listProducts: async (_req: Parameters<RequestHandler>[0], res: Response) => res.json(publicSchemas.paginatedAdminProductsSchema.parse(await catalog.products.listAdmin.execute(res.locals.validated.query))),
    getProduct: async (_req: Parameters<RequestHandler>[0], res: Response) => { const product = await catalog.products.get.execute({ publicId: id(res) }); res.json(publicSchemas.fullAdminProductSchema.parse(product)); },
    updateProduct: async (_req: Parameters<RequestHandler>[0], res: Response) => { const body = res.locals.validated.body; await catalog.products.update.execute({ actor: actor(res), productPublicId: id(res), name: body.name, description: body.description, categoryPublicId: body.categoryId, brandPublicId: body.brandId }); res.status(204).end(); },
    setProductActive: async (_req: Parameters<RequestHandler>[0], res: Response) => { await (res.locals.validated.body.isActive ? catalog.products.activate : catalog.products.deactivate).execute({ publicId: id(res), actor: actor(res) }); res.status(204).end(); },
    deleteProduct: async (_req: Parameters<RequestHandler>[0], res: Response) => { await catalog.products.delete.execute({ publicId: id(res), actor: actor(res) }); res.status(204).end(); },
    replaceOptions: async (_req: Parameters<RequestHandler>[0], res: Response) => { await catalog.products.replaceOptions.execute({ ...res.locals.validated.body, productPublicId: id(res), actor: actor(res) }); res.status(204).end(); },
    addVariant: async (_req: Parameters<RequestHandler>[0], res: Response) => res.status(201).json(publicSchemas.createdCatalogEntitySchema.parse(await catalog.variants.add.execute({ ...res.locals.validated.body, productPublicId: id(res), actor: actor(res) }))),
    updateVariant: async (_req, res) => {
      const params = schemas.productVariantParamsSchema.parse(res.locals.validated.params);
      await catalog.variants.update.execute({
        ...res.locals.validated.body, variantPublicId: params.variantPublicId,
        productPublicId: params.publicId, actor: actor(res),
      });
      res.status(204).end();
    },
    deleteVariant: async (_req, res) => {
      const params = schemas.productVariantParamsSchema.parse(res.locals.validated.params);
      await catalog.variants.delete.execute({
        publicId: params.variantPublicId, productPublicId: params.publicId, actor: actor(res),
      });
      res.status(204).end();
    },
    uploadImages: async (req, res) => {
      const files = req.files;
      if (!Array.isArray(files) || files.length === 0) {
        throw new ValidateError("Solicitud inválida", undefined, "images: se requiere al menos un archivo", "body");
      }
      const altTexts: (string | null)[] = res.locals.validated.body.altTexts;
      if (altTexts.length > 0 && altTexts.length !== files.length) {
        throw new ValidateError("Solicitud inválida", undefined, "altTexts: la longitud debe coincidir con los archivos", "body");
      }
      const images = files.map((file, index) => ({
        buffer: file.buffer, format: format(file.buffer), altText: altTexts[index] ?? null,
      }));
      const uploaded = await catalog.images.upload.execute({ actor: actor(res), images });
      res.status(201).json(publicSchemas.uploadedImagesSchema.parse(uploaded));
    },
    updateImage: async (_req: Parameters<RequestHandler>[0], res: Response) => { await catalog.images.update.execute({ imagePublicId: imageId(res), altText: res.locals.validated.body.altText ?? null, actor: actor(res) }); res.status(204).end(); },
    deleteImage: async (_req: Parameters<RequestHandler>[0], res: Response) => { await catalog.images.delete.execute({ imagePublicId: imageId(res), actor: actor(res) }); res.status(204).end(); },
    assignProductCover: async (_req: Parameters<RequestHandler>[0], res: Response) => { await catalog.images.assignProductCover.execute({ publicId: id(res), imagePublicId: res.locals.validated.body.imagePublicId, actor: actor(res) }); res.status(204).end(); },
    assignVariantCover: async (_req, res) => {
      const params = schemas.productVariantParamsSchema.parse(res.locals.validated.params);
      await catalog.images.assignVariantCover.execute({
        publicId: params.variantPublicId, productPublicId: params.publicId,
        imagePublicId: res.locals.validated.body.imagePublicId, actor: actor(res),
      });
      res.status(204).end();
    },
    setVariantCarousel: async (_req, res) => {
      const params = schemas.productVariantParamsSchema.parse(res.locals.validated.params);
      await catalog.images.setVariantCarousel.execute({
        publicId: params.variantPublicId, productPublicId: params.publicId,
        imagePublicIds: res.locals.validated.body.imagePublicIds, actor: actor(res),
      });
      res.status(204).end();
    },
    servePublicImage: serve(catalog, false), serveAdminImage: serve(catalog, true),
  };
}
export function onUploadFailure(err: unknown, _req: Parameters<RequestHandler>[0], _res: Response, next: Parameters<RequestHandler>[2]) {
  if (err instanceof multer.MulterError) next(new ValidateError("Solicitud inválida", undefined, err.message, "body")); else next(err);
}

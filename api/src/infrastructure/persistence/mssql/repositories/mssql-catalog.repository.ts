import sql from "mssql";
import { Brand } from "../../../../domain/catalog/entities/brand.entity.js";
import { Category } from "../../../../domain/catalog/entities/category.entity.js";
import { Product } from "../../../../domain/catalog/entities/product.entity.js";
import { Image, type ImageSnapshot } from "../../../../domain/catalog/entities/image.entity.js";
import { Variant } from "../../../../domain/catalog/entities/product-variant.entity.js";
import { CatalogSort } from "../../../../domain/catalog/enums/catalog-sort.enum.js";
import type {
  AdminProductFilter,
  CatalogReadRepository,
  CatalogWriteRepository,
  NewProductOptionData,
  NewProductOptionValueData,
  ProductState,
  PublicCatalogFilter,
  VariantCarouselImage,
  VariantComboValue,
  VariantState,
} from "../../../../domain/catalog/interfaces/repositories/catalog.repository.js";
import type {
  AdminProductListItemReadModel,
} from "../../../../domain/catalog/readmodels/product-admin.read-model.js";
import type { AdminProductReadModel } from "../../../../domain/catalog/readmodels/product-admin.read-model.js";
import type { ProductOptionSnapshot } from "../../../../domain/catalog/entities/product-option.entity.js";
import type { BrandReadModel } from "../../../../domain/catalog/readmodels/brand.read-model.js";
import type { CategoryReadModel } from "../../../../domain/catalog/readmodels/category.read-model.js";
import type { PublicProductListItemReadModel } from "../../../../domain/catalog/readmodels/public-catalog.read-model.js";
import type { ProductImageReadModel } from "../../../../domain/catalog/readmodels/product-image.read-model.js";
import { NotFoundError } from "../../../../domain/shared/errors/not-found.js";
import type { PaginatedReadModel } from "../../../../domain/shared/readmodels/paginated.read-model.js";
import type { CommandExecutor } from "../../../../domain/shared/interfaces/providers/sql-executor.js";
import {
  firstRow,
  readBoolean,
  readNullableString,
  readNumber,
  readString,
  readUuid,
} from "../mssql-helpers.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";

const PROCEDURES = {
  saveCategory: "SP_Catalogo_CategoriasGuardar",
  deleteCategory: "SP_Catalogo_CategoriasEliminar",
  listCategories: "SP_Catalogo_CategoriasListar",
  findCategoryByPublicId: "SP_Catalogo_CategoriasObtenerPorIDPublico",
  findCategoryProducts: "SP_Catalogo_CategoriasTieneProductos",
  saveBrand: "SP_Catalogo_MarcasGuardar",
  deleteBrand: "SP_Catalogo_MarcasEliminar",
  listBrands: "SP_Catalogo_MarcasListar",
  findBrandByPublicId: "SP_Catalogo_MarcasObtenerPorIDPublico",
  findBrandProducts: "SP_Catalogo_MarcasTieneProductos",
  saveProduct: "SP_Catalogo_ProductosGuardar",
  findProductByPublicId: "SP_Catalogo_ProductosObtenerPorIDPublico",
  findProductByInternalId: "SP_Catalogo_ProductosObtenerPorID",
  listProductsAdmin: "SP_Catalogo_ProductosListarAdmin",
  listPublicProducts: "SP_Catalogo_ProductosListarPublico",
  softDeleteProduct: "SP_Catalogo_ProductosEliminar",
  saveVariant: "SP_Catalogo_VariantesGuardar",
  findVariantByPublicId: "SP_Catalogo_VariantesObtenerPorIDPublico",
  listVariantsOfProduct: "SP_Catalogo_VariantesListarDeProducto",
  softDeleteVariant: "SP_Catalogo_VariantesEliminar",
  saveOption: "SP_Catalogo_OpcionesGuardar",
  saveOptionValue: "SP_Catalogo_ValoresGuardar",
  listOptionsOfProduct: "SP_Catalogo_OpcionesListarDeProducto",
  replaceOptionsOfProduct: "SP_Catalogo_OpcionesEliminarDeProducto",
  clearCombo: "SP_Catalogo_CombosVaciarDeVariante",
  addComboValue: "SP_Catalogo_CombosAgregar",
  listComboValues: "SP_Catalogo_CombosListar",
  saveImage: "SP_Catalogo_ImagenesGuardar",
  updateImage: "SP_Catalogo_ImagenesActualizar",
  findImageByStorageKey: "SP_Catalogo_ImagenesObtenerPorClave",
  findImageByPublicId: "SP_Catalogo_ImagenesObtenerPorIDPublico",
  findImageByInternalId: "SP_Catalogo_ImagenesObtenerPorID",
  listVariantCarousel: "SP_Catalogo_ImagenesListarDeVariante",
  imageReferences: "SP_Catalogo_ImagenesReferencias",
  setCover: "SP_Catalogo_PortadasAsignar",
  setCarousel: "SP_Catalogo_CarruselAsignar",
  deleteImagePhysically: "SP_Catalogo_ImagenesEliminarFisico",
} as const;

/** Sorting value expected by SP_Catalogo_ProductosListarPublico (@OrdenPor). */
const SORT_VALUES: Readonly<Record<CatalogSort, string>> = {
  [CatalogSort.NAME]: "nombre",
  [CatalogSort.PRICE]: "precio",
  [CatalogSort.NEWEST]: "fecha",
};

/** Reads a DATETIME2 column exposed as a JS `Date` by the driver into ISO 8601 UTC string. */
function readIsoDate(row: SqlRow, column: string): string {
  const value = row[column];
  if (value instanceof Date) {
    return value.toISOString();
  }
  throw new TypeError(`Se esperaba fecha en la columna ${column}`);
}

/**
 * Reads a DECIMAL(10,2) column. The driver returns decimals as strings; the
 * conversion is exact for scale-2 amounts.
 */
function readDecimal(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new TypeError(`Se esperaba número en la columna ${column}`);
}

/** Reads a nullable DECIMAL(10,2) column (e.g. variant price aggregates without variants). */
function readNullableDecimal(row: SqlRow, column: string): number | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  return readDecimal(row, column);
}

function toCategoryReadModel(row: SqlRow): CategoryReadModel {
  return {
    id: readNumber(row, "IDCategoria"),
    publicId: readUuid(row, "IDPublico"),
    name: readString(row, "Nombre"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
  };
}

function toBrandReadModel(row: SqlRow): BrandReadModel {
  return {
    id: readNumber(row, "IDMarca"),
    publicId: readUuid(row, "IDPublico"),
    name: readString(row, "Nombre"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
  };
}

function toProductState(row: SqlRow): ProductState {
  return {
    id: readNumber(row, "IDProducto"),
    publicId: readUuid(row, "IDPublico"),
    categoryId: readNumber(row, "IDCategoria"),
    brandId: readNumber(row, "IDMarca"),
    name: readString(row, "Nombre"),
    description: readString(row, "Descripcion"),
    coverImageId: row.IDImagenPortada === null ? null : readNumber(row, "IDImagenPortada"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
    createdAt: readIsoDate(row, "FechaRegistro"),
    updatedAt: readIsoDate(row, "FechaActualizacion"),
  };
}

function toVariantState(row: SqlRow): VariantState {
  return {
    id: readNumber(row, "IDVariante"),
    publicId: readUuid(row, "IDPublico"),
    productId: readNumber(row, "IDProducto"),
    coverImageId: row.IDImagenPortada === null ? null : readNumber(row, "IDImagenPortada"),
    sku: readString(row, "SKU"),
    name: readString(row, "NombreVariante"),
    unitCost: readNullableDecimal(row, "CostoUnitario"),
    unitPrice: readDecimal(row, "PrecioUnitario"),
    sortOrder: readNumber(row, "Orden"),
    existenciaFisica: readNumber(row, "ExistenciaFisica"),
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
  };
}

function toImageState(row: SqlRow): ImageSnapshot {
  return {
    id: readNumber(row, "IDImagen"),
    publicId: readUuid(row, "IDPublico"),
    storageKey: readString(row, "ClaveAlmacenamiento"),
    contentType: readString(row, "TipoContenido"),
    sizeBytes: readNumber(row, "TamanoBytes"),
    width: readNumber(row, "Ancho"),
    height: readNumber(row, "Alto"),
    altText: readNullableString(row, "TextoAlternativo"),
  };
}

/** Joined product row (without the variant aggregates of the listing). */
function toAdminProductDetail(row: SqlRow): AdminProductReadModel {
  return {
    publicId: readUuid(row, "IDPublico"),
    categoryId: readNumber(row, "IDCategoria"),
    categoryPublicId: readUuid(row, "CategoriaIDPublico"),
    categoryName: readString(row, "NombreCategoria"),
    brandId: readNumber(row, "IDMarca"),
    brandPublicId: readUuid(row, "MarcaIDPublico"),
    brandName: readString(row, "NombreMarca"),
    name: readString(row, "Nombre"),
    description: readString(row, "Descripcion"),
    coverImage: null,
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
    createdAt: readIsoDate(row, "FechaRegistro"),
  };
}

function toAdminProductListItem(row: SqlRow): AdminProductListItemReadModel {
  return {
    publicId: readUuid(row, "IDPublico"),
    categoryId: readNumber(row, "IDCategoria"),
    categoryPublicId: readUuid(row, "CategoriaIDPublico"),
    categoryName: readString(row, "NombreCategoria"),
    brandId: readNumber(row, "IDMarca"),
    brandPublicId: readUuid(row, "MarcaIDPublico"),
    brandName: readString(row, "NombreMarca"),
    name: readString(row, "Nombre"),
    description: readString(row, "Descripcion"),
    coverImage: null,
    isActive: readBoolean(row, "Activo"),
    isDeleted: readBoolean(row, "Eliminado"),
    createdAt: readIsoDate(row, "FechaRegistro"),
    activeVariantCount: readNumber(row, "CantidadVariantesActivas"),
    minPrice: readNullableDecimal(row, "PrecioMinimo"),
    maxPrice: readNullableDecimal(row, "PrecioMaximo"),
  };
}

function toPublicProductListItem(row: SqlRow): PublicProductListItemReadModel {
  return {
    publicId: readUuid(row, "IDPublico"),
    name: readString(row, "Nombre"),
    description: readString(row, "Descripcion"),
    coverImage: null,
    categoryName: readString(row, "NombreCategoria"),
    categoryPublicId: readUuid(row, "CategoriaIDPublico"),
    brandName: readString(row, "NombreMarca"),
    brandPublicId: readUuid(row, "MarcaIDPublico"),
    minPrice: readNullableDecimal(row, "PrecioMinimo"),
    variantCount: readNumber(row, "CantidadVariantes"),
    createdAt: readIsoDate(row, "FechaRegistro"),
  };
}

function toComboValue(row: SqlRow): VariantComboValue {
  return {
    valueId: readNumber(row, "IDValor"),
    valuePublicId: readUuid(row, "IDPublico"),
    value: readString(row, "Valor"),
  };
}

/** Builds the paginated result exactly like the rest of the repositories. */
function toPaginated<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): PaginatedReadModel<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0,
  };
}

/** Builds the two-recordset pagination shape used by the listing procedures. */
function toTwoRecordsetPagination(
  countRecordset: SqlRow[] | undefined,
  pageRecordset: SqlRow[] | undefined,
  _page: number,
  _pageSize: number,
): { totalItems: number; pageRows: SqlRow[] } {
  const countRow = firstRow(countRecordset);
  return {
    totalItems: countRow === null ? 0 : readNumber(countRow, "TotalFilas"),
    pageRows: pageRecordset ?? [],
  };
}

/**
 * Catalog persistence on SQL Server through stored procedures.
 *
 * Write methods run inside the use-case `CommandExecutor` (transaction); read
 * methods run on the executor provided to the constructor.
 */
export class MssqlCatalogRepository implements CatalogWriteRepository, CatalogReadRepository {
  constructor(private readonly executor: SqlExecutor) {}

  withExecutor(executor: CommandExecutor): CatalogReadRepository {
    return new MssqlCatalogRepository(executor);
  }

  async lockProduct(executor: CommandExecutor, productId: number): Promise<void> {
    await executor.execute("SP_Catalogo_ProductosBloquear", [
      { name: "IDProducto", type: sql.Int, value: productId },
    ]);
  }

  async saveCategory(executor: CommandExecutor, category: Category): Promise<void> {
    const snapshot = category.toSnapshot();
    await executor.execute(PROCEDURES.saveCategory, [
      // id is null on inserts; the stored procedure decides insert/update.
      { name: "IDCategoria", type: sql.Int, value: snapshot.id },
      { name: "IDPublico", type: sql.UniqueIdentifier, value: snapshot.publicId },
      { name: "Nombre", type: sql.NVarChar(100), value: snapshot.name },
      { name: "Activo", type: sql.Bit, value: snapshot.isActive },
    ]);
  }

  async softDeleteCategory(
    executor: CommandExecutor,
    categoryInternalId: number,
  ): Promise<void> {
    await executor.execute(PROCEDURES.deleteCategory, [
      { name: "IDCategoria", type: sql.Int, value: categoryInternalId },
    ]);
  }

  async saveBrand(executor: CommandExecutor, brand: Brand): Promise<void> {
    const snapshot = brand.toSnapshot();
    await executor.execute(PROCEDURES.saveBrand, [
      { name: "IDMarca", type: sql.Int, value: snapshot.id },
      { name: "IDPublico", type: sql.UniqueIdentifier, value: snapshot.publicId },
      { name: "Nombre", type: sql.NVarChar(100), value: snapshot.name },
      { name: "Activo", type: sql.Bit, value: snapshot.isActive },
    ]);
  }

  async softDeleteBrand(
    executor: CommandExecutor,
    brandInternalId: number,
  ): Promise<void> {
    await executor.execute(PROCEDURES.deleteBrand, [
      { name: "IDMarca", type: sql.Int, value: brandInternalId },
    ]);
  }

  async saveProduct(executor: CommandExecutor, product: Product): Promise<number> {
    const snapshot = product.toSnapshot();
    const result = await executor.execute(PROCEDURES.saveProduct, [
      { name: "IDProducto", type: sql.Int, value: snapshot.id },
      { name: "IDPublico", type: sql.UniqueIdentifier, value: snapshot.publicId },
      { name: "IDCategoria", type: sql.Int, value: snapshot.categoryId },
      { name: "IDMarca", type: sql.Int, value: snapshot.brandId },
      { name: "Nombre", type: sql.NVarChar(200), value: snapshot.name },
      { name: "Descripcion", type: sql.NVarChar(2000), value: snapshot.description },
      { name: "Activo", type: sql.Bit, value: snapshot.isActive },
    ]);
    // The procedure returns the full row; the internal id feeds option/variant
    // creation inside the same transaction.
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new Error("El procedimiento de producto no devolvió filas");
    }
    return readNumber(row, "IDProducto");
  }

  async softDeleteProduct(executor: CommandExecutor, productInternalId: number): Promise<void> {
    await executor.execute(PROCEDURES.softDeleteProduct, [
      { name: "IDProducto", type: sql.Int, value: productInternalId },
    ]);
  }

  async softDeleteVariant(executor: CommandExecutor, variantInternalId: number): Promise<void> {
    await executor.execute(PROCEDURES.softDeleteVariant, [
      { name: "IDVariante", type: sql.Int, value: variantInternalId },
    ]);
  }

  async saveVariant(
    executor: CommandExecutor,
    variant: Variant,
    productId: number,
  ): Promise<number> {
    const snapshot = variant.toSnapshot();
    const result = await executor.execute(PROCEDURES.saveVariant, [
      { name: "IDVariante", type: sql.Int, value: snapshot.id },
      { name: "IDPublico", type: sql.UniqueIdentifier, value: snapshot.publicId },
      { name: "IDProducto", type: sql.Int, value: productId },
      { name: "SKU", type: sql.NVarChar(64), value: snapshot.sku },
      { name: "NombreVariante", type: sql.NVarChar(100), value: snapshot.name },
      { name: "CostoUnitario", type: sql.Decimal(10, 2), value: snapshot.unitCost },
      { name: "PrecioUnitario", type: sql.Decimal(10, 2), value: snapshot.unitPrice },
      { name: "Orden", type: sql.Int, value: snapshot.sortOrder },
      { name: "Activo", type: sql.Bit, value: snapshot.isActive },
    ]);
    // The internal id feeds the combo rows inside the same transaction.
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new Error("El procedimiento de variante no devolvió filas");
    }
    return readNumber(row, "IDVariante");
  }

  async saveOption(
    executor: CommandExecutor,
    productInternalId: number,
    option: NewProductOptionData,
  ): Promise<number> {
    const result = await executor.execute(PROCEDURES.saveOption, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: option.publicId },
      { name: "IDProducto", type: sql.Int, value: productInternalId },
      { name: "NombreOpcion", type: sql.NVarChar(50), value: option.name },
      { name: "Orden", type: sql.Int, value: option.sortOrder },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new Error("El procedimiento de opción no devolvió filas");
    }
    return readNumber(row, "IDOpcion");
  }

  async saveOptionValue(
    executor: CommandExecutor,
    optionInternalId: number,
    value: NewProductOptionValueData,
  ): Promise<number> {
    const result = await executor.execute(PROCEDURES.saveOptionValue, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: value.publicId },
      { name: "IDOpcion", type: sql.Int, value: optionInternalId },
      { name: "Valor", type: sql.NVarChar(50), value: value.value },
      { name: "Orden", type: sql.Int, value: value.sortOrder },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new Error("El procedimiento de valor no devolvió filas");
    }
    return readNumber(row, "IDValor");
  }

  async replaceOptionsOfProduct(
    executor: CommandExecutor,
    productInternalId: number,
  ): Promise<void> {
    await executor.execute(PROCEDURES.replaceOptionsOfProduct, [
      { name: "IDProducto", type: sql.Int, value: productInternalId },
    ]);
  }

  async clearCombo(executor: CommandExecutor, variantInternalId: number): Promise<void> {
    await executor.execute(PROCEDURES.clearCombo, [
      { name: "IDVariante", type: sql.Int, value: variantInternalId },
    ]);
  }

  async addComboValue(
    executor: CommandExecutor,
    variantInternalId: number,
    valueInternalId: number,
  ): Promise<void> {
    await executor.execute(PROCEDURES.addComboValue, [
      { name: "IDVariante", type: sql.Int, value: variantInternalId },
      { name: "IDValor", type: sql.Int, value: valueInternalId },
    ]);
  }

  async saveImage(executor: CommandExecutor, image: Image): Promise<void> {
    const snapshot = image.toSnapshot();
    await executor.execute(PROCEDURES.saveImage, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: snapshot.publicId },
      { name: "ClaveAlmacenamiento", type: sql.NVarChar(100), value: snapshot.storageKey },
      { name: "TipoContenido", type: sql.NVarChar(50), value: snapshot.contentType },
      { name: "TamanoBytes", type: sql.Int, value: snapshot.sizeBytes },
      { name: "Ancho", type: sql.Int, value: snapshot.width },
      { name: "Alto", type: sql.Int, value: snapshot.height },
      { name: "TextoAlternativo", type: sql.NVarChar(300), value: snapshot.altText },
    ]);
  }

  async updateImage(executor: CommandExecutor, image: Image): Promise<void> {
    const snapshot = image.toSnapshot();
    await executor.execute(PROCEDURES.updateImage, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: snapshot.publicId },
      { name: "TextoAlternativo", type: sql.NVarChar(300), value: snapshot.altText },
    ]);
  }

  async deleteImagePhysically(executor: CommandExecutor, imagePublicId: string): Promise<ImageSnapshot | null> {
    const result = await executor.execute(PROCEDURES.deleteImagePhysically, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: imagePublicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toImageState(row);
  }

  async setProductCover(executor: CommandExecutor, productId: number, imageId: number | null): Promise<void> {
    await this.setCover(executor, "producto", productId, imageId);
  }

  async setVariantCover(executor: CommandExecutor, variantId: number, imageId: number | null): Promise<void> {
    await this.setCover(executor, "variante", variantId, imageId);
  }

  private async setCover(executor: CommandExecutor, type: string, id: number, imageId: number | null): Promise<void> {
    await executor.execute(PROCEDURES.setCover, [
      { name: "TipoEntidad", type: sql.NVarChar(10), value: type },
      { name: "IDEntidad", type: sql.Int, value: id },
      { name: "IDImagen", type: sql.Int, value: imageId },
    ]);
  }

  async setVariantCarousel(executor: CommandExecutor, variantId: number, imageIds: number[]): Promise<void> {
    await executor.execute(PROCEDURES.setCarousel, [
      { name: "IDVariante", type: sql.Int, value: variantId },
      { name: "IDImagen", type: sql.Int, value: null },
      { name: "Orden", type: sql.Int, value: null },
    ]);
    for (const [index, imageId] of imageIds.entries()) {
      await executor.execute(PROCEDURES.setCarousel, [
        { name: "IDVariante", type: sql.Int, value: variantId },
        { name: "IDImagen", type: sql.Int, value: imageId },
        { name: "Orden", type: sql.Int, value: index + 1 },
      ]);
    }
  }

  async listCategories(
    includeDeleted: boolean,
    page: number,
    pageSize: number,
  ): Promise<PaginatedReadModel<CategoryReadModel>> {
    const result = await this.executor.execute(PROCEDURES.listCategories, [
      { name: "VerEliminados", type: sql.Bit, value: includeDeleted },
      { name: "Pagina", type: sql.Int, value: page },
      { name: "TamanoPagina", type: sql.Int, value: pageSize },
    ]);
    const { totalItems, pageRows } = toTwoRecordsetPagination(
      result.recordsets[0],
      result.recordsets[1],
      page,
      pageSize,
    );
    return toPaginated(pageRows.map(toCategoryReadModel), page, pageSize, totalItems);
  }

  async findCategoryByPublicId(publicId: string): Promise<CategoryReadModel | null> {
    const result = await this.executor.execute(PROCEDURES.findCategoryByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toCategoryReadModel(row);
  }

  async findCategoryProducts(
    executor: CommandExecutor,
    categoryInternalId: number,
  ): Promise<string[]> {
    // The procedure is an existence probe (TOP 1). Any row present means the
    // category has products; multiple rows are mapped in case the procedure
    // later starts returning all of them.
    const result = await executor.execute(PROCEDURES.findCategoryProducts, [
      { name: "IDCategoria", type: sql.Int, value: categoryInternalId },
    ]);
    return result.recordset.map((row) => readUuid(row, "ProductoIDPublico"));
  }

  async listBrands(
    includeDeleted: boolean,
    page: number,
    pageSize: number,
  ): Promise<PaginatedReadModel<BrandReadModel>> {
    const result = await this.executor.execute(PROCEDURES.listBrands, [
      { name: "VerEliminados", type: sql.Bit, value: includeDeleted },
      { name: "Pagina", type: sql.Int, value: page },
      { name: "TamanoPagina", type: sql.Int, value: pageSize },
    ]);
    const { totalItems, pageRows } = toTwoRecordsetPagination(
      result.recordsets[0],
      result.recordsets[1],
      page,
      pageSize,
    );
    return toPaginated(pageRows.map(toBrandReadModel), page, pageSize, totalItems);
  }

  async findBrandByPublicId(publicId: string): Promise<BrandReadModel | null> {
    const result = await this.executor.execute(PROCEDURES.findBrandByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toBrandReadModel(row);
  }

  async findBrandProducts(
    executor: CommandExecutor,
    brandInternalId: number,
  ): Promise<string[]> {
    // Same existence-probe pattern as findCategoryProducts.
    const result = await executor.execute(PROCEDURES.findBrandProducts, [
      { name: "IDMarca", type: sql.Int, value: brandInternalId },
    ]);
    return result.recordset.map((row) => readUuid(row, "ProductoIDPublico"));
  }

  async findProductStateByPublicId(publicId: string): Promise<ProductState | null> {
    const result = await this.executor.execute(PROCEDURES.findProductByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toProductState(row);
  }

  async findProductStateByInternalId(
    productInternalId: number,
  ): Promise<ProductState | null> {
    const result = await this.executor.execute(PROCEDURES.findProductByInternalId, [
      { name: "IDProducto", type: sql.Int, value: productInternalId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toProductState(row);
  }

  async findProductDetailByPublicId(
    publicId: string,
  ): Promise<AdminProductReadModel | null> {
    const result = await this.executor.execute(PROCEDURES.findProductByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : { ...toAdminProductDetail(row), coverImage: await this.coverFromRow(row, true) };
  }

  async listProductsAdmin(
    filters: AdminProductFilter,
  ): Promise<PaginatedReadModel<AdminProductListItemReadModel>> {
    // SP_Catalogo_ProductosListarAdmin filters by exact equality on @Eliminado
    // (BIT, default 0): it cannot express "list everything". With
    // includeDeleted = true the deleted products are listed; false lists the
    // active ones. This limitation is reported to the caller stage.
    const result = await this.executor.execute(PROCEDURES.listProductsAdmin, [
      { name: "IDCategoria", type: sql.Int, value: filters.categoryId ?? null },
      { name: "IDMarca", type: sql.Int, value: filters.brandId ?? null },
      { name: "Eliminado", type: sql.Bit, value: filters.includeDeleted ? 1 : 0 },
      { name: "Pagina", type: sql.Int, value: filters.page },
      { name: "TamanoPagina", type: sql.Int, value: filters.pageSize },
    ]);
    const { totalItems, pageRows } = toTwoRecordsetPagination(
      result.recordsets[0],
      result.recordsets[1],
      filters.page,
      filters.pageSize,
    );
    return toPaginated(
      await Promise.all(pageRows.map(async (row) => ({
        ...toAdminProductListItem(row), coverImage: await this.coverFromRow(row, true),
      }))),
      filters.page,
      filters.pageSize,
      totalItems,
    );
  }

  async listPublicProducts(
    filters: PublicCatalogFilter,
  ): Promise<PaginatedReadModel<PublicProductListItemReadModel>> {
    // The stored procedure filters by internal ids; public ids are resolved
    // first and a missing entity is reported as NOT_FOUND.
    let categoryId: number | null = null;
    if (filters.categoryId !== undefined) {
      categoryId = await this.resolveCategoryInternalId(filters.categoryId);
    }
    let brandId: number | null = null;
    if (filters.brandId !== undefined) {
      brandId = await this.resolveBrandInternalId(filters.brandId);
    }
    const result = await this.executor.execute(PROCEDURES.listPublicProducts, [
      // The procedure has no ESCAPE clause: no wildcard escaping is applied here.
      { name: "Texto", type: sql.NVarChar(200), value: filters.searchText ?? null },
      { name: "IDCategoria", type: sql.Int, value: categoryId },
      { name: "IDMarca", type: sql.Int, value: brandId },
      { name: "PrecioMinimo", type: sql.Decimal(10, 2), value: filters.minPrice ?? null },
      { name: "PrecioMaximo", type: sql.Decimal(10, 2), value: filters.maxPrice ?? null },
      { name: "SoloDisponible", type: sql.Bit, value: filters.onlyAvailable },
      { name: "OrdenPor", type: sql.NVarChar(20), value: SORT_VALUES[filters.sort] },
      { name: "Pagina", type: sql.Int, value: filters.page },
      { name: "TamanoPagina", type: sql.Int, value: filters.pageSize },
    ]);
    const { totalItems, pageRows } = toTwoRecordsetPagination(
      result.recordsets[0],
      result.recordsets[1],
      filters.page,
      filters.pageSize,
    );
    return toPaginated(
      await Promise.all(pageRows.map(async (row) => ({
        ...toPublicProductListItem(row), coverImage: await this.coverFromRow(row, false),
      }))),
      filters.page,
      filters.pageSize,
      totalItems,
    );
  }

  async findVariantByPublicId(publicId: string): Promise<VariantState | null> {
    const result = await this.executor.execute(PROCEDURES.findVariantByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toVariantState(row);
  }

  async listVariantsOfProduct(productInternalId: number): Promise<VariantState[]> {
    const result = await this.executor.execute(PROCEDURES.listVariantsOfProduct, [
      { name: "IDProducto", type: sql.Int, value: productInternalId },
    ]);
    return result.recordset.map(toVariantState);
  }

  async listComboValues(variantInternalId: number): Promise<VariantComboValue[]> {
    const result = await this.executor.execute(PROCEDURES.listComboValues, [
      { name: "IDVariante", type: sql.Int, value: variantInternalId },
    ]);
    return result.recordset.map(toComboValue);
  }

  /**
   * Options (recordset 0) and their values (recordset 1), grouped by option
   * in the order returned by the procedure.
   */
  async listOptionsOfProduct(
    productInternalId: number,
  ): Promise<ProductOptionSnapshot[]> {
    const result = await this.executor.execute(PROCEDURES.listOptionsOfProduct, [
      { name: "IDProducto", type: sql.Int, value: productInternalId },
    ]);
    const valuesByOption = new Map<number, ProductOptionSnapshot["values"]>();
    for (const row of result.recordsets[1] ?? []) {
      const optionId = readNumber(row, "IDOpcion");
      const list = valuesByOption.get(optionId) ?? [];
      list.push({
        id: readNumber(row, "IDValor"),
        publicId: readUuid(row, "IDPublico"),
        value: readString(row, "Valor"),
        sortOrder: readNumber(row, "Orden"),
      });
      valuesByOption.set(optionId, list);
    }
    return (result.recordsets[0] ?? []).map((row) => {
      const optionId = readNumber(row, "IDOpcion");
      return {
        id: optionId,
        publicId: readUuid(row, "IDPublico"),
        name: readString(row, "NombreOpcion"),
        values: valuesByOption.get(optionId) ?? [],
      };
    });
  }

  async findImageByStorageKey(storageKey: string): Promise<ImageSnapshot | null> {
    const result = await this.executor.execute(PROCEDURES.findImageByStorageKey, [
      { name: "ClaveAlmacenamiento", type: sql.NVarChar(100), value: storageKey },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toImageState(row);
  }

  private async coverFromRow(row: SqlRow, isAdmin: boolean): Promise<ProductImageReadModel | null> {
    if (row.IDImagenPortada === null) return null;
    const image = await this.findImageByInternalId(readNumber(row, "IDImagenPortada"));
    if (image === null) return null;
    return {
      publicId: image.publicId,
      url: `/api/v1/${isAdmin ? "images" : "catalog/images"}/${image.publicId}`,
      storageKey: image.storageKey, contentType: image.contentType,
      sizeBytes: image.sizeBytes, width: image.width, height: image.height, altText: image.altText,
    };
  }

  async findImageByPublicId(publicId: string): Promise<ImageSnapshot | null> {
    const result = await this.executor.execute(PROCEDURES.findImageByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: publicId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toImageState(row);
  }

  async findImageByInternalId(id: number): Promise<ImageSnapshot | null> {
    const result = await this.executor.execute(PROCEDURES.findImageByInternalId, [
      { name: "IDImagen", type: sql.Int, value: id },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toImageState(row);
  }

  async listVariantCarousel(variantId: number): Promise<VariantCarouselImage[]> {
    const result = await this.executor.execute(PROCEDURES.listVariantCarousel, [
      { name: "IDVariante", type: sql.Int, value: variantId },
    ]);
    return result.recordset.map((row) => ({ image: toImageState(row), sortOrder: readNumber(row, "Orden") }));
  }

  async hasImageReferences(imageId: number): Promise<boolean> {
    return await this.hasReferences(imageId, false);
  }

  async canServeImagePublicly(imageId: number): Promise<boolean> {
    return await this.hasReferences(imageId, true);
  }

  private async hasReferences(imageId: number, publicOnly: boolean): Promise<boolean> {
    const result = await this.executor.execute(PROCEDURES.imageReferences, [
      { name: "IDImagen", type: sql.Int, value: imageId },
      { name: "SoloPublica", type: sql.Bit, value: publicOnly },
    ]);
    const row = firstRow(result.recordset);
    return row !== null && readBoolean(row, "TieneReferencias");
  }

  private async resolveCategoryInternalId(categoryPublicId: string): Promise<number> {
    const result = await this.executor.execute(PROCEDURES.findCategoryByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: categoryPublicId },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new NotFoundError("Category not found", undefined, undefined, undefined);
    }
    return readNumber(row, "IDCategoria");
  }

  private async resolveBrandInternalId(brandPublicId: string): Promise<number> {
    const result = await this.executor.execute(PROCEDURES.findBrandByPublicId, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: brandPublicId },
    ]);
    const row = firstRow(result.recordset);
    if (row === null) {
      throw new NotFoundError("Brand not found", undefined, undefined, undefined);
    }
    return readNumber(row, "IDMarca");
  }
}

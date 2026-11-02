import sql from "mssql";
import type {
  Address,
  AddressSnapshot,
} from "../../../../domain/addresses/entities/address.entity.js";
import type {
  AddressReadRepository,
  AddressWriteRepository,
  AddressReadModel,
  DepartmentReadModel,
  MunicipalityReadModel,
  UpdateAddressCommand,
} from "../../../../domain/addresses/interfaces/repositories/address.repository.js";
import { NotFoundError } from "../../../../domain/shared/errors/not-found.js";
import { BusinessRuleViolation } from "../../../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../../../domain/shared/enums/error-code.enum.js";
import type { PaginatedReadModel } from "../../../../domain/shared/readmodels/paginated.read-model.js";
import type { CommandExecutor } from "../../../../domain/shared/interfaces/providers/sql-executor.js";
import {
  firstRow,
  readNumber,
  readString,
  readUuid,
} from "../mssql-helpers.js";
import type { SqlExecutor, SqlRow } from "../sql-executor.js";

const PROCEDURES = {
  listDepartments: "SP_Direcciones_DepartamentosListar",
  listMunicipalities: "SP_Direcciones_MunicipiosListarPorDepartamento",
  insertAddress: "SP_Direcciones_Crear",
  listOwnAddresses: "SP_Direcciones_ListarPorUsuario",
  findOwnAddress: "SP_Direcciones_ObtenerPorIDPublico",
  updateAddress: "SP_Direcciones_Actualizar",
  deleteAddress: "SP_Direcciones_Eliminar",
} as const;

/** THROW numbers raised by the address procedures (range 50500..50505, migration 009). */
const THROW_DEPARTMENT_NOT_FOUND = 50500;
const THROW_MUNICIPALITY_NOT_FOUND = 50501;
const THROW_ADDRESS_NOT_OWNED = 50505;

/**
 * Translates the procedure-level THROW numbers of the addresses module into
 * domain errors; unique-index violations are handled centrally by the
 * executor's `mapSqlError`.
 */
function mapAddressThrow(error: unknown): unknown {
  if (!(error instanceof sql.RequestError) || error.number === undefined) {
    return error;
  }
  switch (error.number) {
    case THROW_DEPARTMENT_NOT_FOUND:
      return new NotFoundError(
        "Department not found",
        ErrorCode.DEPARTMENT_NOT_FOUND,
        undefined,
        undefined,
      );
    case THROW_MUNICIPALITY_NOT_FOUND:
      return new BusinessRuleViolation(
        "The municipality does not exist",
        ErrorCode.INVALID_MUNICIPALITY,
        undefined,
        undefined,
      );
    case THROW_ADDRESS_NOT_OWNED:
      return new NotFoundError(
        "Address not found",
        ErrorCode.ADDRESS_NOT_FOUND,
        undefined,
        undefined,
      );
    default:
      return error;
  }
}

/** Maps one detail row (joined municipality/department names) to the read model. */
function toAddressReadModel(row: SqlRow): AddressReadModel {
  return {
    publicId: readUuid(row, "IDPublico"),
    recipientFirstName: readString(row, "NombresRecibe"),
    recipientLastName: readString(row, "ApellidosRecibe"),
    phone: readString(row, "Telefono"),
    exactAddress: readString(row, "DireccionExacta"),
    reference: readString(row, "Referencia"),
    municipalityPublicId: readString(row, "IDPublicoMunicipio").toLowerCase(),
    municipalityName: readString(row, "NombreMunicipio"),
    departmentName: readString(row, "NombreDepartamento"),
    registeredAt: toIso(row, "FechaRegistro"),
    updatedAt: toIso(row, "FechaActualizacion"),
  };
}

function toSnapshot(row: SqlRow, original: AddressSnapshot): AddressSnapshot {
  return {
    ...original,
    id: readNumber(row, "IDDireccion"),
    registeredAt: toIso(row, "FechaRegistro"),
    updatedAt: toIso(row, "FechaActualizacion"),
  };
}

/** Requires one row in a write result set; never empty in this module. */
function requireRow(rows: readonly SqlRow[] | undefined): SqlRow {
  const row = firstRow(rows);
  if (row === null) {
    throw new Error("El procedimiento de direcciones no devolvio filas");
  }
  return row;
}

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

/** Reads a DATETIME2(3) column exposed as a JS `Date` into ISO 8601 UTC string. */
function toIso(row: SqlRow, column: string): string {
  const value = row[column];
  if (!(value instanceof Date)) {
    throw new TypeError(`Se esperaba fecha en la columna ${column}`);
  }
  return value.toISOString();
}

/**
 * Address persistence on SQL Server through stored procedures. Write methods
 * receive the use-case `CommandExecutor` (UnitOfWork transaction); read
 * methods run on the executor provided to the constructor. Procedures never
 * open transactions.
 */
export class MssqlAddressRepository
  implements AddressReadRepository, AddressWriteRepository
{
  constructor(private readonly executor: SqlExecutor) {}

  async listDepartments(): Promise<DepartmentReadModel[]> {
    const result = await this.executor.execute(PROCEDURES.listDepartments, []);
    return (result.recordset ?? []).map((row) => ({
      publicId: readUuid(row, "IDPublico"),
      code: readString(row, "Codigo"),
      name: readString(row, "Nombre"),
    }));
  }

  async listMunicipalities(
    departmentPublicId: string,
  ): Promise<MunicipalityReadModel[]> {
    try {
      const result = await this.executor.execute(
        PROCEDURES.listMunicipalities,
        [
          {
            name: "IDPublicoDepartamento",
            type: sql.UniqueIdentifier,
            value: departmentPublicId,
          },
        ],
      );
      return (result.recordset ?? []).map((row) => ({
        publicId: readUuid(row, "IDPublico"),
        name: readString(row, "Nombre"),
      }));
    } catch (error: unknown) {
      throw mapAddressThrow(error);
    }
  }

  /** Inserts the address; the SP resolves the municipality and stamps dates. */
  async insertAddress(
    executor: CommandExecutor,
    address: Address,
  ): Promise<AddressSnapshot> {
    const snapshot = address.toSnapshot();
    try {
      const result = await executor.execute(PROCEDURES.insertAddress, [
        {
          name: "IDPublico",
          type: sql.UniqueIdentifier,
          value: snapshot.publicId,
        },
        { name: "IDUsuario", type: sql.Int, value: snapshot.userId },
        {
          name: "NombresRecibe",
          type: sql.NVarChar(100),
          value: snapshot.recipientFirstName,
        },
        {
          name: "ApellidosRecibe",
          type: sql.NVarChar(100),
          value: snapshot.recipientLastName,
        },
        { name: "Telefono", type: sql.NVarChar(20), value: snapshot.phone },
        {
          name: "IDPublicoMunicipio",
          type: sql.UniqueIdentifier,
          value: snapshot.municipalityPublicId,
        },
        {
          name: "DireccionExacta",
          type: sql.NVarChar(300),
          value: snapshot.exactAddress,
        },
        {
          name: "Referencia",
          type: sql.NVarChar(300),
          value: snapshot.reference,
        },
      ]);
      return toSnapshot(requireRow(result.recordset), snapshot);
    } catch (error: unknown) {
      throw mapAddressThrow(error);
    }
  }

  /** Updates an owned, non-deleted address; the SP checks ownership again. */
  async updateAddress(
    executor: CommandExecutor,
    command: UpdateAddressCommand,
  ): Promise<AddressReadModel> {
    try {
      const result = await executor.execute(PROCEDURES.updateAddress, [
        {
          name: "IDPublico",
          type: sql.UniqueIdentifier,
          value: command.addressPublicId,
        },
        { name: "IDUsuario", type: sql.Int, value: command.customerId },
        {
          name: "NombresRecibe",
          type: sql.NVarChar(100),
          value: command.recipientFirstName,
        },
        {
          name: "ApellidosRecibe",
          type: sql.NVarChar(100),
          value: command.recipientLastName,
        },
        { name: "Telefono", type: sql.NVarChar(20), value: command.phone },
        {
          name: "IDPublicoMunicipio",
          type: sql.UniqueIdentifier,
          value: command.municipalityPublicId,
        },
        {
          name: "DireccionExacta",
          type: sql.NVarChar(300),
          value: command.exactAddress,
        },
        {
          name: "Referencia",
          type: sql.NVarChar(300),
          value: command.reference,
        },
      ]);
      return toAddressReadModel(requireRow(result.recordset));
    } catch (error: unknown) {
      throw mapAddressThrow(error);
    }
  }

  async softDeleteAddress(
    executor: CommandExecutor,
    customerId: number,
    addressPublicId: string,
  ): Promise<void> {
    try {
      await executor.execute(PROCEDURES.deleteAddress, [
        {
          name: "IDPublico",
          type: sql.UniqueIdentifier,
          value: addressPublicId,
        },
        { name: "IDUsuario", type: sql.Int, value: customerId },
      ]);
    } catch (error: unknown) {
      throw mapAddressThrow(error);
    }
  }

  async findOwnDetailByPublicId(
    customerId: number,
    addressPublicId: string,
  ): Promise<AddressReadModel | null> {
    const result = await this.executor.execute(PROCEDURES.findOwnAddress, [
      { name: "IDPublico", type: sql.UniqueIdentifier, value: addressPublicId },
      { name: "IDUsuario", type: sql.Int, value: customerId },
    ]);
    const row = firstRow(result.recordset);
    return row === null ? null : toAddressReadModel(row);
  }

  async listOwnAddresses(
    customerId: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedReadModel<AddressReadModel>> {
    const result = await this.executor.execute(PROCEDURES.listOwnAddresses, [
      { name: "IDUsuario", type: sql.Int, value: customerId },
      { name: "Pagina", type: sql.Int, value: page },
      { name: "TamanoPagina", type: sql.Int, value: pageSize },
    ]);
    const countRow = firstRow(result.recordsets[0]);
    const totalItems =
      countRow === null ? 0 : readNumber(countRow, "TotalFilas");
    const items = (result.recordsets[1] ?? []).map(toAddressReadModel);
    return toPaginated(items, page, pageSize, totalItems);
  }
}

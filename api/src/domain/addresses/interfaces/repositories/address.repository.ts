import type { CommandExecutor } from "../../../shared/interfaces/providers/sql-executor.js";
import type { PaginatedReadModel } from "../../../shared/readmodels/paginated.read-model.js";
import type {
  Address,
  AddressDetail,
  AddressSnapshot,
  NormalizedAddressFields,
} from "../../entities/address.entity.js";

/** One row of the Guatemala departments catalog. */
export interface DepartmentReadModel {
  publicId: string;
  code: string;
  name: string;
}

/** One row of a department's municipality catalog. */
export interface MunicipalityReadModel {
  publicId: string;
  name: string;
}

/** Address catalog reads: geography plus the customer's own addresses. */
export interface AddressReadRepository {
  listDepartments(): Promise<DepartmentReadModel[]>;
  /**
   * Lists the municipalities of one department; DEPARTMENT_NOT_FOUND when the
   * department does not exist.
   */
  listMunicipalities(departmentPublicId: string): Promise<MunicipalityReadModel[]>;
  /**
   * Detail of one owned, non-deleted address. Ownership travels in the query:
   * an unknown or foreign address is null (mapped to ADDRESS_NOT_FOUND).
   */
  findOwnDetailByPublicId(
    customerId: number,
    addressPublicId: string,
  ): Promise<AddressReadModel | null>;
  /** Lists the non-deleted addresses of one customer, most recent first. */
  listOwnAddresses(
    customerId: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedReadModel<AddressReadModel>>;
}

/** Adds and changes addresses; every write runs inside the use case transaction. */
export interface AddressWriteRepository {
  /** Inserts the address; returns { publicId }. */
  insertAddress(executor: CommandExecutor, address: Address): Promise<AddressSnapshot>;
  /**
   * Replaces the fields of an owned, non-deleted address (the persistence
   * re-validates ownership and the municipality); returns the refreshed detail.
   */
  updateAddress(
    executor: CommandExecutor,
    command: UpdateAddressCommand,
  ): Promise<AddressReadModel>;
  /** Logical delete of an owned, non-deleted address (ADDRESS_NOT_FOUND otherwise). */
  softDeleteAddress(executor: CommandExecutor, customerId: number, addressPublicId: string): Promise<void>;
}

/** Communication of an update with its ownership context. */
export interface UpdateAddressCommand extends NormalizedAddressFields {
  customerId: number;
  addressPublicId: string;
}

/** Public detail read model of one address (joined municipality/department names). */
export type AddressReadModel = AddressDetail;
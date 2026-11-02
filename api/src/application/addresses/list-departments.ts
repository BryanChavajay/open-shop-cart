import type {
  AddressReadRepository,
  DepartmentReadModel,
} from "../../domain/addresses/interfaces/repositories/address.repository.js";

/** Queries the Guatemala departments catalog (small, unpaginated table). */
export class ListDepartments {
  constructor(private readonly reads: AddressReadRepository) {}

  async execute(): Promise<DepartmentReadModel[]> {
    return this.reads.listDepartments();
  }
}

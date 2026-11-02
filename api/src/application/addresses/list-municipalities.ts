import type {
  AddressReadRepository,
  MunicipalityReadModel,
} from "../../domain/addresses/interfaces/repositories/address.repository.js";

export interface ListMunicipalitiesQuery {
  departmentPublicId: string;
}

/** Lists the municipalities of one department for the address selectors. */
export class ListMunicipalities {
  constructor(private readonly reads: AddressReadRepository) {}

  async execute(
    query: ListMunicipalitiesQuery,
  ): Promise<MunicipalityReadModel[]> {
    return this.reads.listMunicipalities(query.departmentPublicId);
  }
}

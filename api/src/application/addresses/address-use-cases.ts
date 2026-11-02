import { CreateAddress } from "./create-address.js";
import { DeleteOwnAddress } from "./delete-own-address.js";
import { GetOwnAddress } from "./get-own-address.js";
import { ListDepartments } from "./list-departments.js";
import { ListMunicipalities } from "./list-municipalities.js";
import { ListOwnAddresses } from "./list-own-addresses.js";
import { UpdateOwnAddress } from "./update-own-address.js";

/** Use cases of the addresses module, grouped the way routers consume them. */
export interface AddressUseCases {
  geo: {
    listDepartments: ListDepartments;
    listMunicipalities: ListMunicipalities;
  };
  own: {
    create: CreateAddress;
    list: ListOwnAddresses;
    get: GetOwnAddress;
    update: UpdateOwnAddress;
    delete: DeleteOwnAddress;
  };
}

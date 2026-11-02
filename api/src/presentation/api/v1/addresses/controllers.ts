import type { RequestHandler, Response } from "express";
import type { AddressUseCases } from "../../../../application/addresses/address-use-cases.js";
import * as schemas from "../../../../infrastructure/dtos/zod/addresses/request.schemas.js";
import * as publicSchemas from "../../../../infrastructure/dtos/zod/addresses/public.schemas.js";
import { currentUser } from "../middleware/current-user.js";

type AddressControllers = Record<
  | "listDepartments"
  | "listMunicipalities"
  | "create"
  | "list"
  | "get"
  | "update"
  | "delete",
  RequestHandler
>;

/** The internal id of the guarded user is the ownership anchor everywhere. */
function currentCustomerId(res: Response): number {
  return currentUser(res).id;
}

export function createAddressControllers(addresses: AddressUseCases): AddressControllers {
  return {
    listDepartments: async (_req, res) =>
      res.json(
        publicSchemas.departmentSchema
          .array()
          .parse(await addresses.geo.listDepartments.execute()),
      ),
    listMunicipalities: async (_req, res) =>
      res.json(
        publicSchemas.municipalitySchema
          .array()
          .parse(
            await addresses.geo.listMunicipalities.execute({
              departmentPublicId:
                schemas.departmentParamsSchema.parse(res.locals.validated.params)
                  .departmentPublicId,
            }),
          ),
      ),
    create: async (_req, res) =>
      res
        .status(201)
        .json(
          publicSchemas.createdAddressSchema.parse(
            await addresses.own.create.execute({
              ...res.locals.validated.body,
              customerId: currentCustomerId(res),
              joinExecutor: null,
            }),
          ),
        ),
    list: async (_req, res) =>
      res.json(
        publicSchemas.paginatedAddressesSchema.parse(
          await addresses.own.list.execute({
            customerId: currentCustomerId(res),
            page: res.locals.validated.query.page,
            pageSize: res.locals.validated.query.pageSize,
          }),
        ),
      ),
    get: async (_req, res) =>
      res.json(
        publicSchemas.addressDetailSchema.parse(
          await addresses.own.get.execute({
            customerId: currentCustomerId(res),
            addressPublicId: schemas.addressParamsSchema.parse(
              res.locals.validated.params,
            ).addressPublicId,
          }),
        ),
      ),
    update: async (_req, res) =>
      res.json(
        publicSchemas.addressDetailSchema.parse(
          await addresses.own.update.execute({
            customerId: currentCustomerId(res),
            addressPublicId: schemas.addressParamsSchema.parse(
              res.locals.validated.params,
            ).addressPublicId,
            ...res.locals.validated.body,
            joinExecutor: null,
          }),
        ),
      ),
    delete: async (_req, res) => {
      await addresses.own.delete.execute({
        customerId: currentCustomerId(res),
        addressPublicId: schemas.addressParamsSchema.parse(
          res.locals.validated.params,
        ).addressPublicId,
        joinExecutor: null,
      });
      res.status(204).end();
    },
  };
}

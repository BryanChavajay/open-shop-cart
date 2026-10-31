import type { UserUseCases } from "../../../../application/users/user-use-cases.js";
import type { RequestHandler } from "express";
import * as schemas from "../../../../infrastructure/dtos/zod/users/request.schemas.js";
import * as publicSchemas from "../../../../infrastructure/dtos/zod/users/public.schemas.js";
import { currentUser } from "../middleware/current-user.js";

export function createUsersControllers(
  users: UserUseCases,
): Record<
  | "me"
  | "updateMe"
  | "list"
  | "create"
  | "get"
  | "update"
  | "setActive"
  | "delete"
  | "startRecovery"
  | "resendConfirmation",
  RequestHandler
> {
  return {
    me: (_req, res) => {
      res.json(publicSchemas.publicUserSchema.parse(currentUser(res)));
    },
    updateMe: async (_req, res) => {
        await users.updateOwnProfile.execute({
          ...schemas.updateOwnProfileSchema.parse(res.locals.validated.body),
          actor: currentUser(res),
        });
        res.status(204).end();
    },
    list: async (_req, res) => {
      const filter = schemas.listUsersQuerySchema.parse(
        res.locals.validated.query,
      );
      res.json(
        publicSchemas.paginatedUsersPublicSchema.parse(
          await users.list.execute({
          ...filter,
          email: filter.email,
          }),
        ),
      );
    },
    create: async (_req, res) => {
        const body = schemas.createInternalUserSchema.parse(
          res.locals.validated.body,
        );
        res.status(201).json(
          publicSchemas.createdUserPublicSchema.parse(
            await users.create.execute({
              ...body,
              lastName: body.lastName ?? null,
            }),
          ),
        );
    },
    get: async (_req, res) => {
      res.json(
        publicSchemas.userDetailPublicSchema.parse(
          await users.get.execute({
            ...schemas.userIdParamsSchema.parse(res.locals.validated.params),
          }),
        ),
      );
    },
    update: async (_req, res) => {
        await users.update.execute({
          ...schemas.updateInternalUserSchema.parse(res.locals.validated.body),
          ...schemas.userIdParamsSchema.parse(res.locals.validated.params),
          actor: currentUser(res),
        });
        res.status(204).end();
    },
    setActive: async (_req, res) => {
        const command = {
          ...schemas.userIdParamsSchema.parse(res.locals.validated.params),
          actor: currentUser(res),
        };
        const { isActive } = schemas.setUserActiveSchema.parse(
          res.locals.validated.body,
        );
        await (isActive ? users.activate : users.deactivate).execute(command);
        res.status(204).end();
    },
    delete: async (_req, res) => {
        await users.delete.execute({
          ...schemas.userIdParamsSchema.parse(res.locals.validated.params),
          actor: currentUser(res),
        });
        res.status(204).end();
    },
    startRecovery: async (_req, res) => {
        await users.startRecovery.execute({
          ...schemas.userIdParamsSchema.parse(res.locals.validated.params),
        });
        res.status(204).end();
    },
    resendConfirmation: async (_req, res) => {
        await users.resendConfirmation.execute({
          ...schemas.userIdParamsSchema.parse(res.locals.validated.params),
        });
        res.status(204).end();
    },
  };
}

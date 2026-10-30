import type { RequestHandler, Response } from "express";
import { z } from "zod";
import type { AdminService } from "../modules/users/admin.service.js";
import type { UserRepository, UserScope } from "../modules/users/user.repository.js";
import type { InvitationService } from "../modules/auth/invitation.service.js";
import { listUsersSchema, userIdSchema } from "../modules/users/user.dto.js";
import { HttpError } from "../modules/auth/errors.js";

const emptyBody = z.strictObject({});
function managedScope(res: Response): UserScope | undefined {
  return res.locals.identity!.user.role === "ADMIN" ? { roles: ["AGENT", "USER"] } : undefined;
}
interface UsersController {
  create: RequestHandler;
  listing: RequestHandler;
  get: RequestHandler;
  update: RequestHandler;
  disable: RequestHandler;
  enable: RequestHandler;
  invite?: RequestHandler;
  resendInvitation?: RequestHandler;
}

export function createUsersController(admin: AdminService, users: UserRepository, invitations?: InvitationService): UsersController {
  const setEnabled = (enabled: boolean): RequestHandler => async (req, res) => {
    emptyBody.parse(req.body ?? {});
    res.json(await admin.setEnabled(res.locals.identity!.user.id, req.params.id, enabled));
  };
  return {
    create: async (req, res) => {
      const user = await admin.create(res.locals.identity!.user.id, req.body);
      res.location(`/users/${user.id}`).status(201).json(user);
    },
    listing: async (req, res) => {
      res.json(await users.listing(listUsersSchema.parse(req.query), managedScope(res)));
    },
    get: async (req, res) => {
      const user = await users.get(userIdSchema.parse(req.params.id), managedScope(res));
      if (!user) throw new HttpError(404, "Utilisateur introuvable");
      res.json(user);
    },
    update: async (req, res) => {
      res.json(await admin.update(res.locals.identity!.user.id, req.params.id, req.body));
    },
    disable: setEnabled(false),
    enable: setEnabled(true),
    invite: invitations ? async (req, res) => {
      await invitations.invite(res.locals.identity!.user.id, req.body);
      res.sendStatus(202);
    } : undefined,
    resendInvitation: invitations ? async (req, res) => {
      emptyBody.parse(req.body ?? {});
      await invitations.resend(res.locals.identity!.user.id, req.params.id);
      res.sendStatus(202);
    } : undefined,
  };
}

import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { AdminService } from "../modules/users/admin.service.js";
import type { UserRepository } from "../modules/users/user.repository.js";
import { listUsersSchema, userIdSchema } from "../modules/users/user.dto.js";
import { authenticate, requireRoles } from "../middlewares/authenticate.js";
import { HttpError } from "../modules/auth/errors.js";
import type { InvitationService } from "../modules/auth/invitation.service.js";

export function createUsersRouter(auth: AuthService, admin: AdminService, users: UserRepository, invitations?: InvitationService): Router {
  const router = Router();
  router.use(authenticate(auth), requireRoles("SUPER_ADMIN"));
  if (invitations) {
    router.post("/invitations", async (req, res) => { await invitations.invite(res.locals.identity!.user.id, req.body); res.sendStatus(202); });
    router.post("/:id/resend-invitation", async (req, res) => {
      z.strictObject({}).parse(req.body ?? {});
      await invitations.resend(res.locals.identity!.user.id, req.params.id); res.sendStatus(202);
    });
  }
  router.post("/", async (req, res) => {
    const user = await admin.create(res.locals.identity!.user.id, req.body);
    res.location(`/users/${user.id}`).status(201).json(user);
  });
  router.get("/", async (req, res) => { res.json(await users.listing(listUsersSchema.parse(req.query))); });
  router.get("/:id", async (req, res) => {
    const user = await users.get(userIdSchema.parse(req.params.id));
    if (!user) throw new HttpError(404, "Utilisateur introuvable");
    res.json(user);
  });
  router.patch("/:id", async (req, res) => { res.json(await admin.update(res.locals.identity!.user.id, req.params.id, req.body)); });
  for (const [action, enabled] of [["disable", false], ["enable", true]] as const) {
    router.post(`/:id/${action}`, async (req, res) => {
      z.strictObject({}).parse(req.body ?? {});
      res.json(await admin.setEnabled(res.locals.identity!.user.id, req.params.id, enabled));
    });
  }
  return router;
}

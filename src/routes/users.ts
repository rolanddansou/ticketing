import { Router } from "express";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { AdminService } from "../modules/users/admin.service.js";
import type { UserRepository } from "../modules/users/user.repository.js";
import type { InvitationService } from "../modules/auth/invitation.service.js";
import { authenticate, requireRoles } from "../middlewares/authenticate.js";
import { createUsersController } from "../controllers/users.controller.js";

export function createUsersRouter(auth: AuthService, admin: AdminService, users: UserRepository, invitations?: InvitationService): Router {
  const router = Router();
  const controller = createUsersController(admin, users, invitations);

  router.use(authenticate(auth), requireRoles("SUPER_ADMIN", "ADMIN"));
  if (controller.invite) router.post("/invitations", controller.invite);
  if (controller.resendInvitation) router.post("/:id/resend-invitation", controller.resendInvitation);
  router.post("/", controller.create);
  router.get("/", controller.listing);
  router.get("/:id", controller.get);
  router.patch("/:id", controller.update);
  router.post("/:id/disable", controller.disable);
  router.post("/:id/enable", controller.enable);

  return router;
}

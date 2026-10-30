import { Router } from "express";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { InvitationService } from "../modules/auth/invitation.service.js";
import type { PasswordRecoveryService } from "../modules/auth/password-recovery.service.js";
import { authenticate } from "../middlewares/authenticate.js";
import { csrf, defaultBrowser, type BrowserConfig } from "../middlewares/browser-security.js";
import { limitRequests } from "../middlewares/rate-limit.js";
import { noStore } from "../middlewares/no-store.js";
import { createAuthController } from "../controllers/auth.controller.js";

export function createAuthRouter(service: AuthService, browser: BrowserConfig = defaultBrowser, invitations?: InvitationService, recovery?: PasswordRecoveryService): Router {
  const router = Router();
  const controller = createAuthController(service, browser, invitations, recovery);

  router.use(noStore);
  router.post("/login", limitRequests(10, 60_000), controller.login);
  router.post("/refresh", csrf(browser), limitRequests(60, 60_000), controller.refresh);
  router.post("/logout", csrf(browser), controller.logout);
  router.post("/logout-all", csrf(browser), authenticate(service), controller.logoutAll);
  router.get("/me", authenticate(service), controller.me);
  router.post("/change-password", authenticate(service), limitRequests(10, 15 * 60000), controller.changePassword);

  if (controller.acceptInvitation) router.post("/accept-invitation", limitRequests(10, 15 * 60000), controller.acceptInvitation);
  if (controller.forgotPassword) router.post("/forgot-password", limitRequests(5, 15 * 60000), controller.forgotPassword);
  if (controller.resetPassword) router.post("/reset-password", limitRequests(10, 15 * 60000), controller.resetPassword);

  return router;
}

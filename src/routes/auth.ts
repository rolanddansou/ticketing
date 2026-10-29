import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { AuthService } from "../modules/auth/auth.service.js";
import { loginSchema } from "../modules/auth/auth.dto.js";
import { authenticate } from "../middlewares/authenticate.js";
import { csrf, clearRefresh, setRefresh, readRefresh, defaultBrowser, type BrowserConfig } from "../middlewares/browser-security.js";
import { unauthorized } from "../modules/auth/errors.js";
import type { InvitationService } from "../modules/auth/invitation.service.js";
import type { PasswordRecoveryService } from "../modules/auth/password-recovery.service.js";

export const limitRequests = (limit: number, windowMs: number) => rateLimit({
  windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: { message: "Trop de tentatives, réessayez plus tard" } },
});
export function createAuthRouter(service: AuthService, browser: BrowserConfig = defaultBrowser, invitations?: InvitationService, recovery?: PasswordRecoveryService): Router {
  const router = Router();
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.post("/login", limitRequests(10, 60_000), async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const { refreshToken, refreshExpiresAt, ...body } = await service.login(email, password);
    setRefresh(res, refreshToken, refreshExpiresAt, browser);
    res.json(body);
  });
  router.post("/refresh", csrf(browser), limitRequests(60, 60_000), async (req, res) => {
    const token = readRefresh(req);
    if (!token) { clearRefresh(res, browser); throw unauthorized(); }
    try {
      const { refreshToken, refreshExpiresAt, ...body } = await service.refresh(token);
      setRefresh(res, refreshToken, refreshExpiresAt, browser);
      res.json(body);
    } catch (error) { clearRefresh(res, browser); throw error; }
  });
  router.post("/logout", csrf(browser), async (req, res) => {
    await service.logout(readRefresh(req)); clearRefresh(res, browser); res.sendStatus(204);
  });
  router.post("/logout-all", csrf(browser), authenticate(service), async (_req, res) => {
    await service.logoutAll(res.locals.identity!.user.id); clearRefresh(res, browser); res.sendStatus(204);
  });
  router.get("/me", authenticate(service), (_req, res) => { res.json(res.locals.identity!.user); });
  router.post("/change-password", authenticate(service), limitRequests(10, 15 * 60000), async (req, res) => {
    await service.changePassword(res.locals.identity!, req.body); clearRefresh(res, browser); res.sendStatus(204);
  });
  if (invitations) router.post("/accept-invitation", limitRequests(10, 15 * 60000), async (req, res) => {
    await invitations.accept(req.body); res.sendStatus(204);
  });
  if (recovery) {
    router.post("/forgot-password", limitRequests(5, 15 * 60000), async (req, res) => {
      await recovery.forgot(req.body);
      res.status(202).json({ message: "Si ce compte est actif, un email de réinitialisation sera envoyé" });
    });
    router.post("/reset-password", limitRequests(10, 15 * 60000), async (req, res) => {
      await recovery.reset(req.body); clearRefresh(res, browser); res.sendStatus(204);
    });
  }
  return router;
}

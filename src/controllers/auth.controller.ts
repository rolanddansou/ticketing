import type { RequestHandler } from "express";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { InvitationService } from "../modules/auth/invitation.service.js";
import type { PasswordRecoveryService } from "../modules/auth/password-recovery.service.js";
import { loginSchema } from "../modules/auth/auth.dto.js";
import { unauthorized } from "../modules/auth/errors.js";
import { clearRefresh, setRefresh, readRefresh, type BrowserConfig } from "../middlewares/browser-security.js";

interface AuthController {
  login: RequestHandler;
  refresh: RequestHandler;
  logout: RequestHandler;
  logoutAll: RequestHandler;
  me: RequestHandler;
  changePassword: RequestHandler;
  acceptInvitation?: RequestHandler;
  forgotPassword?: RequestHandler;
  resetPassword?: RequestHandler;
}

export function createAuthController(service: AuthService, browser: BrowserConfig, invitations?: InvitationService, recovery?: PasswordRecoveryService): AuthController {
  return {
    login: async (req, res) => {
      const { email, password } = loginSchema.parse(req.body);
      const { refreshToken, refreshExpiresAt, ...body } = await service.login(email, password);
      setRefresh(res, refreshToken, refreshExpiresAt, browser);
      res.json(body);
    },
    refresh: async (req, res) => {
      const token = readRefresh(req);
      if (!token) { clearRefresh(res, browser); throw unauthorized(); }
      try {
        const { refreshToken, refreshExpiresAt, ...body } = await service.refresh(token);
        setRefresh(res, refreshToken, refreshExpiresAt, browser);
        res.json(body);
      } catch (error) { clearRefresh(res, browser); throw error; }
    },
    logout: async (req, res) => {
      await service.logout(readRefresh(req));
      clearRefresh(res, browser);
      res.sendStatus(204);
    },
    logoutAll: async (_req, res) => {
      await service.logoutAll(res.locals.identity!.user.id);
      clearRefresh(res, browser);
      res.sendStatus(204);
    },
    me: (_req, res) => { res.json(res.locals.identity!.user); },
    changePassword: async (req, res) => {
      await service.changePassword(res.locals.identity!, req.body);
      clearRefresh(res, browser);
      res.sendStatus(204);
    },
    acceptInvitation: invitations ? async (req, res) => {
      await invitations.accept(req.body);
      res.sendStatus(204);
    } : undefined,
    forgotPassword: recovery ? async (req, res) => {
      await recovery.forgot(req.body);
      res.status(202).json({ message: "Si ce compte est actif, un email de réinitialisation sera envoyé" });
    } : undefined,
    resetPassword: recovery ? async (req, res) => {
      await recovery.reset(req.body);
      clearRefresh(res, browser);
      res.sendStatus(204);
    } : undefined,
  };
}

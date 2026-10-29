import type { RequestHandler } from "express";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { Identity } from "../modules/auth/auth.repository.js";
import { HttpError, unauthorized } from "../modules/auth/errors.js";
import type { UserDto } from "../modules/users/user.dto.js";

declare global { namespace Express { interface Locals { identity?: Identity } } }
export function authenticate(service: AuthService): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? "");
    if (!match) throw unauthorized();
    res.locals.identity = await service.authenticate(match[1]);
    next();
  };
}
export function requireRoles(...roles: UserDto["role"][]): RequestHandler {
  return (_req, res, next) => {
    if (!res.locals.identity) throw unauthorized();
    if (!roles.includes(res.locals.identity.user.role)) throw new HttpError(403, "Accès interdit");
    next();
  };
}

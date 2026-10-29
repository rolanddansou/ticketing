import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { AuthService } from "../modules/auth/auth.service.js";
import { loginSchema } from "../modules/auth/auth.dto.js";
import { authenticate } from "../middlewares/authenticate.js";

export const limitRequests = (limit: number, windowMs: number) => rateLimit({
  windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: { message: "Trop de tentatives, réessayez plus tard" } },
});
export function createAuthRouter(service: AuthService): Router {
  const router = Router();
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.post("/login", limitRequests(10, 60_000), async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await service.login(email, password));
  });
  router.get("/me", authenticate(service), (_req, res) => { res.json(res.locals.identity!.user); });
  return router;
}

import { rateLimit } from "express-rate-limit";

export const limitRequests = (limit: number, windowMs: number) => rateLimit({
  windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: { message: "Trop de tentatives, réessayez plus tard" } },
});

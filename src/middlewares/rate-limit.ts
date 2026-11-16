import { sendApiError } from "./api-error.js";
import { rateLimit, type Options } from "express-rate-limit";

export const limitRequests = (limit: number, windowMs: number, options: Pick<Partial<Options>, "skip" | "keyGenerator"> = {}) => rateLimit({
  ...options, windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
  handler: (_req, res) => sendApiError(res, 429, "Trop de tentatives, réessayez plus tard"),
});

export const globalRateLimit = () => limitRequests(300, 60_000, {
  skip: req => req.method === "OPTIONS" ||
    (["GET", "HEAD"].includes(req.method) && /^\/health\/?$/i.test(req.path)),
});

export const invitationRateLimit = () => limitRequests(30, 15 * 60_000, {
  keyGenerator: (_req, res) => res.locals.identity!.user.id,
});

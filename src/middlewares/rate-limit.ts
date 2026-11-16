import { sendApiError } from "./api-error.js";
import { rateLimit } from "express-rate-limit";

export const limitRequests = (limit: number, windowMs: number) => rateLimit({
  windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
  handler: (_req, res) => sendApiError(res, 429, "Trop de tentatives, réessayez plus tard"),
});

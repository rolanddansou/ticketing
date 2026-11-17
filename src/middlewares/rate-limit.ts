import { sendApiError } from "./api-error.js";
import { rateLimit, ipKeyGenerator, type Options } from "express-rate-limit";

export const limitRequests = (limit: number, windowMs: number, options: Pick<Partial<Options>, "skip" | "keyGenerator"> = {}) => rateLimit({
  ...options, windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
  handler: (_req, res) => sendApiError(res, 429, "Trop de tentatives, réessayez plus tard"),
});

export const globalRateLimit = () => limitRequests(300, 60_000, {
  skip: req => req.method === "OPTIONS" ||
    (["GET", "HEAD"].includes(req.method) && /^\/health\/?$/i.test(req.path)),
});

// /health is exempt from globalRateLimit (above) so a monitoring probe is never starved by API
// traffic, but it must not be fully unbounded either: it runs a real SELECT 1 against Postgres.
export const healthRateLimit = () => limitRequests(120, 60_000);

export const ticketCreationRateLimit = () => limitRequests(30, 15 * 60_000, {
  keyGenerator: (_req, res) => res.locals.identity!.user.id,
});

export const invitationRateLimit = () => limitRequests(30, 15 * 60_000, {
  keyGenerator: (_req, res) => res.locals.identity!.user.id,
});

// Complements the per-IP limit on /auth/login (above): an attacker spreading guesses across many
// source IPs is still capped per targeted account. Keyed on the submitted email, not the
// authenticated user (there is none yet at login). A missing/malformed email falls back to the
// requester's own IP (not a single shared key) so it stays isolated per source instead of letting
// one client's malformed requests rate-limit every other client's malformed requests too.
export const loginAccountRateLimit = () => limitRequests(10, 15 * 60_000, {
  keyGenerator: req => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    if (typeof email === "string" && email.trim()) return email.trim().toLowerCase();
    return ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "");
  },
});

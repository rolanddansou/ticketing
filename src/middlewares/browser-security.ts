import type { RequestHandler, Request, Response } from "express";
import { HttpError } from "../modules/auth/errors.js";
export interface BrowserConfig { origin: string; secure: boolean }
export const defaultBrowser: BrowserConfig = { origin: "http://localhost:5173", secure: false };
const cookieOptions = (config: BrowserConfig) => ({ httpOnly: true, secure: config.secure, sameSite: "lax" as const, path: "/auth" });
export function setRefresh(res: Response, token: string, expires: Date, config: BrowserConfig) {
  res.cookie("refresh_token", token, { ...cookieOptions(config), expires });
}
export function clearRefresh(res: Response, config: BrowserConfig) { res.clearCookie("refresh_token", cookieOptions(config)); }
export function readRefresh(req: Request): string | undefined {
  const matches = (req.headers.cookie ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith("refresh_token="));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice("refresh_token=".length);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
export const csrf = (config: BrowserConfig): RequestHandler => (req, _res, next) => {
  if (req.headers.origin !== config.origin || req.headers["x-csrf-protection"] !== "1") throw new HttpError(403, "Origine ou protection CSRF invalide");
  next();
};
export const cors = (config: BrowserConfig): RequestHandler => (req, res, next) => {
  res.vary("Origin");
  if (req.headers.origin === config.origin) {
    res.set("Access-Control-Allow-Origin", config.origin);
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Protection");
    res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  }
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
};

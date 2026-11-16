import { sendApiError } from "../middlewares/api-error.js";
import type { RequestHandler } from "express";

export function createHealthController(checkDatabase: () => Promise<unknown>): RequestHandler {
  return async (_req, res) => {
    try {
      await checkDatabase();
      res.status(200).json({ status: "ok" });
    } catch {
      sendApiError(res, 503, "Base de données indisponible");
    }
  };
}

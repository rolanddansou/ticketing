import type { RequestHandler } from "express";

export function createHealthController(checkDatabase: () => Promise<unknown>): RequestHandler {
  return async (_req, res) => {
    try {
      await checkDatabase();
      res.status(200).json({ status: "ok" });
    } catch {
      res.status(503).json({ error: { message: "Base de données indisponible" } });
    }
  };
}

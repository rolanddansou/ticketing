import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = typeof error === "object" && error !== null && "status" in error
    ? error.status : undefined;
  const code = typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500
    ? status : 500;
  const message = code === 400 ? "Requête invalide"
    : code === 413 ? "Corps de requête trop volumineux"
    : code < 500 ? "Requête refusée" : "Erreur interne du serveur";

  res.status(code).json({ error: { message } });
};

import type { ErrorRequestHandler } from "express";
import { sendApiError } from "./api-error.js";
import { ZodError } from "zod";
import { HttpError } from "../modules/auth/errors.js";
import { TicketNotFoundError, TicketResolutionConflictError, TicketUserReferenceError } from "../modules/tickets/ticket.repository.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    sendApiError(res, 400, "Requête invalide", error.issues.map(issue => ({
      path: issue.path.join("."), message: "Valeur invalide",
    })));
    return;
  }
  if (error instanceof HttpError) {
    sendApiError(res, error.status, error.status >= 500 ? "Erreur interne du serveur" : error.message);
    return;
  }
  if (error instanceof TicketNotFoundError) {
    sendApiError(res, 404, "Ticket introuvable");
    return;
  }
  if (error instanceof TicketUserReferenceError) {
    sendApiError(res, 422, error.message);
    return;
  }
  if (error instanceof TicketResolutionConflictError) {
    sendApiError(res, 409, error.message);
    return;
  }

  const status = typeof error === "object" && error !== null && "status" in error
    ? error.status : undefined;
  const code = typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500
    ? status : 500;
  const message = code === 400 ? "Requête invalide"
    : code === 413 ? "Corps de requête trop volumineux"
    : code < 500 ? "Requête refusée" : "Erreur interne du serveur";

  if (code === 500) {
    // Never log bodies, URLs, raw messages or Prisma metadata: they may contain secrets.
    const diagnosticCode = typeof error === "object" && error !== null && "code" in error
      && typeof error.code === "string" && /^(P\d{4}|[0-9A-Z]{5}|ECONNREFUSED|ETIMEDOUT|ECONNRESET)$/.test(error.code)
      ? error.code : undefined;
    console.error("Erreur HTTP interne", { code: diagnosticCode });
  }
  sendApiError(res, code, message);
};

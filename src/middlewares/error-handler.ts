import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { TicketNotFoundError, TicketUserReferenceError } from "../modules/tickets/ticket.repository.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: { message: "Requête invalide", issues: error.issues.map(issue => ({
      path: issue.path.join("."), message: issue.message,
    })) } });
    return;
  }
  if (error instanceof TicketNotFoundError) {
    res.status(404).json({ error: { message: "Ticket introuvable" } });
    return;
  }
  if (error instanceof TicketUserReferenceError) {
    res.status(422).json({ error: { message: error.message } });
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
    const frames = error instanceof Error ? error.stack?.split("\n").filter(line => /^\s+at /.test(line)).slice(0, 10) : undefined;
    console.error("Erreur HTTP interne", { code: diagnosticCode, stack: frames });
  }
  res.status(code).json({ error: { message } });
};

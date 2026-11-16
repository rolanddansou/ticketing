import type { RequestHandler } from "express";
import { z } from "zod";
import { HttpError } from "../modules/auth/errors.js";
import { ProposalConflictError, ProposalResolutionRequiredError, type TicketAgentRepository } from "../modules/ticket-agent-ia/repository.js";
import { ticketIdSchema } from "../modules/tickets/ticket.dto.js";

const acceptSchema = z.strictObject({ resolutionText: z.string().trim().min(1).max(8000).optional() });
const rejectSchema = z.strictObject({});

export function createTicketProposalController(repository: TicketAgentRepository) {
  const handler = (decision: "accept" | "reject"): RequestHandler => async (req, res) => {
    const id = ticketIdSchema.parse(req.params.id);
    let text: string | undefined;
    if (decision === "accept") text = acceptSchema.parse(req.body ?? {}).resolutionText;
    else rejectSchema.parse(req.body ?? {});
    try {
      await repository.decide(id, res.locals.identity!.user.id, decision, text);
    } catch (error) {
      if (error instanceof ProposalConflictError) throw new HttpError(409, "Proposition indisponible ou périmée");
      if (error instanceof ProposalResolutionRequiredError) throw new HttpError(400, "Un texte de résolution est requis pour accepter cette proposition");
      throw error;
    }
    res.sendStatus(204);
  };
  return { accept: handler("accept"), reject: handler("reject") };
}

import { Router, type RequestHandler } from "express";
import type { TicketRepository } from "../modules/tickets/ticket.repository.js";
import { requireRoles } from "../middlewares/authenticate.js";
import { createTicketsController } from "../controllers/tickets.controller.js";
import { createTicketProposalController } from "../controllers/ticket-proposal.controller.js";
import type { TicketAgentRepository } from "../modules/ticket-agent-ia/repository.js";
import type { WaitForTicketResult } from "../modules/ticket-agent-ia/wait-for-result.js";

export function createTicketsRouter(repository: TicketRepository, authentication: RequestHandler, agent?: TicketAgentRepository, waitForResult?: WaitForTicketResult): Router {
  const router = Router();
  const controller = createTicketsController(repository, waitForResult);

  router.use(authentication);
  router.post("/", requireRoles("SUPER_ADMIN", "ADMIN", "AGENT", "USER"), controller.create);
  router.patch("/:id", requireRoles("SUPER_ADMIN", "ADMIN", "AGENT"), controller.update);
  router.get("/", controller.listing);
  router.get("/:id", controller.get);
  if (agent) {
    const proposal = createTicketProposalController(agent);
    const support = requireRoles("SUPER_ADMIN", "ADMIN", "AGENT");
    router.post("/:id/ai-proposal/accept", support, proposal.accept);
    router.post("/:id/ai-proposal/reject", support, proposal.reject);
  }

  return router;
}

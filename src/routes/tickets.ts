import { Router, type RequestHandler } from "express";
import type { TicketRepository } from "../modules/tickets/ticket.repository.js";
import { requireRoles } from "../middlewares/authenticate.js";
import { createTicketsController } from "../controllers/tickets.controller.js";

export function createTicketsRouter(repository: TicketRepository, authentication: RequestHandler): Router {
  const router = Router();
  const controller = createTicketsController(repository);

  router.use(authentication);
  router.post("/", requireRoles("SUPER_ADMIN", "ADMIN", "AGENT", "USER"), controller.create);
  router.patch("/:id", requireRoles("SUPER_ADMIN", "ADMIN", "AGENT"), controller.update);
  router.get("/", controller.listing);
  router.get("/:id", controller.get);

  return router;
}

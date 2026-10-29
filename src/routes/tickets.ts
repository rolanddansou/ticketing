import { Router } from "express";
import { createTicketSchema, updateTicketSchema, listTicketsSchema, ticketIdSchema } from "../modules/tickets/ticket.dto.js";
import { TicketNotFoundError, type TicketRepository } from "../modules/tickets/ticket.repository.js";

export function createTicketsRouter(repository: TicketRepository): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const ticket = await repository.create(createTicketSchema.parse(req.body));
    res.location(`/tickets/${ticket.id}`).status(201).json(ticket);
  });

  router.patch("/:id", async (req, res) => {
    const id = ticketIdSchema.parse(req.params.id);
    const ticket = await repository.update(id, updateTicketSchema.parse(req.body));
    res.status(200).json(ticket);
  });

  router.get("/", async (req, res) => {
    const listing = await repository.listing(listTicketsSchema.parse(req.query));
    res.status(200).json(listing);
  });

  router.get("/:id", async (req, res) => {
    const id = ticketIdSchema.parse(req.params.id);
    const ticket = await repository.get(id);
    if (!ticket) throw new TicketNotFoundError(id);
    res.status(200).json(ticket);
  });

  return router;
}

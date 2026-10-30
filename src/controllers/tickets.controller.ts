import type { RequestHandler } from "express";
import { createTicketSchema, updateTicketSchema, listTicketsSchema, ticketIdSchema } from "../modules/tickets/ticket.dto.js";
import { TicketNotFoundError, type TicketRepository } from "../modules/tickets/ticket.repository.js";

const httpCreateSchema = createTicketSchema.omit({ createdById: true });
const userCreateSchema = httpCreateSchema.omit({ status: true, assignedToId: true, resolveById: true });

interface TicketsController {
  create: RequestHandler;
  update: RequestHandler;
  listing: RequestHandler;
  get: RequestHandler;
}

export function createTicketsController(repository: TicketRepository): TicketsController {
  return {
    create: async (req, res) => {
      const user = res.locals.identity!.user;
      const data = (user.role === "USER" ? userCreateSchema : httpCreateSchema).parse(req.body);
      const ticket = await repository.create({ ...data, createdById: user.id });
      res.location(`/tickets/${ticket.id}`).status(201).json(ticket);
    },
    update: async (req, res) => {
      const id = ticketIdSchema.parse(req.params.id);
      const ticket = await repository.update(id, updateTicketSchema.parse(req.body));
      res.status(200).json(ticket);
    },
    listing: async (req, res) => {
      const user = res.locals.identity!.user;
      const scope = user.role === "USER" ? { createdById: user.id } : undefined;
      res.status(200).json(await repository.listing(listTicketsSchema.parse(req.query), scope));
    },
    get: async (req, res) => {
      const id = ticketIdSchema.parse(req.params.id);
      const user = res.locals.identity!.user;
      const ticket = await repository.get(id, user.role === "USER" ? { createdById: user.id } : undefined);
      if (!ticket) throw new TicketNotFoundError(id);
      res.status(200).json(ticket);
    },
  };
}

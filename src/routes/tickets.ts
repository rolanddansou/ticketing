import { Router, type RequestHandler } from "express";
import { createTicketSchema, updateTicketSchema, listTicketsSchema, ticketIdSchema } from "../modules/tickets/ticket.dto.js";
import { TicketNotFoundError, type TicketRepository } from "../modules/tickets/ticket.repository.js";
import { requireRoles } from "../middlewares/authenticate.js";

const httpCreateSchema = createTicketSchema.omit({ createdById: true });
const employeeCreateSchema = httpCreateSchema.omit({ status: true, assignedToId: true, resolveById: true });

export function createTicketsRouter(repository: TicketRepository, authentication: RequestHandler): Router {
  const router = Router();
  router.use(authentication);

  router.post("/", requireRoles("SUPER_ADMIN", "AGENT", "EMPLOYEE"), async (req, res) => {
    const user = res.locals.identity!.user;
    const data = (user.role === "EMPLOYEE" ? employeeCreateSchema : httpCreateSchema).parse(req.body);
    const ticket = await repository.create({ ...data, createdById: user.id });
    res.location(`/tickets/${ticket.id}`).status(201).json(ticket);
  });

  router.patch("/:id", requireRoles("SUPER_ADMIN", "AGENT"), async (req, res) => {
    const id = ticketIdSchema.parse(req.params.id);
    const ticket = await repository.update(id, updateTicketSchema.parse(req.body));
    res.status(200).json(ticket);
  });

  router.get("/", async (req, res) => {
    const user = res.locals.identity!.user;
    const listing = await repository.listing(listTicketsSchema.parse(req.query), user.role === "EMPLOYEE" ? { createdById: user.id } : undefined);
    res.status(200).json(listing);
  });

  router.get("/:id", async (req, res) => {
    const id = ticketIdSchema.parse(req.params.id);
    const user = res.locals.identity!.user;
    const ticket = await repository.get(id, user.role === "EMPLOYEE" ? { createdById: user.id } : undefined);
    if (!ticket) throw new TicketNotFoundError(id);
    res.status(200).json(ticket);
  });

  return router;
}

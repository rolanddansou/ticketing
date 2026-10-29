import { Prisma, type PrismaClient, type Ticket } from "../../generated/prisma/client.js";
import { createTicketSchema, updateTicketSchema, listTicketsSchema, ticketIdSchema } from "./ticket.dto.js";
import type { CreateTicketDto, UpdateTicketDto, ListTicketsDto, TicketDto, TicketListingDto } from "./ticket.dto.js";
import { TicketNotFoundError, TicketUserReferenceError, type TicketRepository } from "./ticket.repository.js";

function toDto(ticket: Ticket): TicketDto {
  return {
    id: ticket.id,
    createdById: ticket.createdById,
    assignedToId: ticket.assignedToId,
    resolveById: ticket.resolveById,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export class PrismaTicketRepository implements TicketRepository {
  constructor(private readonly client: PrismaClient) {}

  async create(input: CreateTicketDto): Promise<TicketDto> {
    const data = createTicketSchema.parse(input);
    try {
      return toDto(await this.client.ticket.create({ data }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new TicketUserReferenceError();
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateTicketDto): Promise<TicketDto> {
    const ticketId = ticketIdSchema.parse(id);
    const data = updateTicketSchema.parse(input);
    try {
      return toDto(await this.client.ticket.update({ where: { id: ticketId }, data }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new TicketUserReferenceError();
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new TicketNotFoundError(ticketId);
      }
      throw error;
    }
  }

  async get(id: string): Promise<TicketDto | null> {
    const ticketId = ticketIdSchema.parse(id);
    const ticket = await this.client.ticket.findUnique({ where: { id: ticketId } });
    return ticket ? toDto(ticket) : null;
  }

  async listing(input: ListTicketsDto): Promise<TicketListingDto> {
    const { page, limit, status, priority, createdById, assignedToId, resolveById } = listTicketsSchema.parse(input);
    const where = { status, priority, createdById, assignedToId, resolveById };
    const [total, items] = await this.client.$transaction([
      this.client.ticket.count({ where }),
      this.client.ticket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: items.map(toDto), total, page, limit };
  }
}

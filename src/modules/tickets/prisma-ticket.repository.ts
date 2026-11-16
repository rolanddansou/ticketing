import { Prisma, type PrismaClient, type Ticket } from "../../generated/prisma/client.js";
import { createTicketSchema, updateTicketSchema, listTicketsSchema, ticketIdSchema } from "./ticket.dto.js";
import type { CreateTicketDto, UpdateTicketDto, ListTicketsDto, TicketDto, TicketListingDto } from "./ticket.dto.js";
import { TicketNotFoundError, TicketResolutionConflictError, TicketUserReferenceError, type TicketRepository, type TicketScope } from "./ticket.repository.js";

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
  constructor(private readonly client: PrismaClient, private readonly enqueueAi = false) {}

  async create(input: CreateTicketDto): Promise<TicketDto> {
    const data = createTicketSchema.parse(input);
    try {
      return toDto(await this.client.ticket.create({ data: {
        ...data,
        ...(this.enqueueAi && data.status === "OPEN" ? { aiJob: { create: { revision: 0 } } } : {}),
      } }));
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
      const leavingClosed = data.status !== undefined && data.status !== "CLOSED";
      const protectsResolver = leavingClosed || data.resolveById !== undefined;
      const update = { ...data, revision: { increment: 1 } };
      if (leavingClosed) {
        const [reopened] = await this.client.ticket.updateManyAndReturn({
          where: { id: ticketId, resolutionSource: { not: null } },
          data: {
            ...update, resolveById: null, resolutionText: null, resolutionSource: null,
            resolvedAt: null, resolutionProcedureId: null,
          },
        });
        if (reopened) return toDto(reopened);
      }
      return toDto(await this.client.ticket.update({
        where: { id: ticketId, ...(protectsResolver ? { resolutionSource: null } : {}) },
        data: update,
      }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new TicketUserReferenceError();
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        if ((data.resolveById !== undefined || (data.status && data.status !== "CLOSED")) &&
            await this.client.ticket.count({ where: { id: ticketId } })) {
          throw new TicketResolutionConflictError();
        }
        throw new TicketNotFoundError(ticketId);
      }
      throw error;
    }
  }

  async get(id: string, scope?: TicketScope): Promise<TicketDto | null> {
    const ticketId = ticketIdSchema.parse(id);
    const ticket = await this.client.ticket.findFirst({
      where: { id: ticketId, createdById: scope?.createdById },
      include: { aiJob: !scope },
    });
    if (!ticket) return null;
    const result = toDto(ticket);
    if (ticket.resolutionText && ticket.resolutionSource && ticket.resolvedAt) {
      result.resolution = {
        text: ticket.resolutionText, source: ticket.resolutionSource,
        resolvedAt: ticket.resolvedAt.toISOString(), procedureId: ticket.resolutionProcedureId,
      };
    }
    if (!scope && ticket.status === "OPEN" && ticket.aiJob?.status === "PROPOSED" &&
        ticket.aiJob.revision === ticket.revision && ticket.aiJob.draft) {
      result.aiProposal = { draft: ticket.aiJob.draft };
    }
    return result;
  }

  async listing(input: ListTicketsDto, scope?: TicketScope): Promise<TicketListingDto> {
    const { page, limit, status, priority, createdById, assignedToId, resolveById, sortBy, sortOrder } = listTicketsSchema.parse(input);
    const where = { status, priority, createdById, assignedToId, resolveById, AND: scope ? { createdById: scope.createdById } : undefined };
    const [total, items] = await this.client.$transaction([
      this.client.ticket.count({ where }),
      this.client.ticket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { id: "desc" }],
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: items.map(toDto), total, page, limit };
  }
}

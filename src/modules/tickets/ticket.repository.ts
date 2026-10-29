import type { CreateTicketDto, UpdateTicketDto, ListTicketsDto, TicketDto, TicketListingDto } from "./ticket.dto.js";

export interface TicketRepository {
  create(input: CreateTicketDto): Promise<TicketDto>;
  update(id: string, input: UpdateTicketDto): Promise<TicketDto>;
  get(id: string): Promise<TicketDto | null>;
  listing(input: ListTicketsDto): Promise<TicketListingDto>;
}

export class TicketNotFoundError extends Error {
  constructor(public readonly ticketId: string) {
    super(`Ticket introuvable : ${ticketId}`);
    this.name = "TicketNotFoundError";
  }
}

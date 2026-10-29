import type { CreateTicketDto, UpdateTicketDto, ListTicketsDto, TicketDto, TicketListingDto } from "./ticket.dto.js";

export interface TicketScope { createdById: string }
export interface TicketRepository {
  create(input: CreateTicketDto): Promise<TicketDto>;
  update(id: string, input: UpdateTicketDto): Promise<TicketDto>;
  get(id: string, scope?: TicketScope): Promise<TicketDto | null>;
  listing(input: ListTicketsDto, scope?: TicketScope): Promise<TicketListingDto>;
}

export class TicketUserReferenceError extends Error {
  constructor() {
    super("Un utilisateur référencé par le ticket n'existe pas");
    this.name = "TicketUserReferenceError";
  }
}

export class TicketNotFoundError extends Error {
  constructor(public readonly ticketId: string) {
    super(`Ticket introuvable : ${ticketId}`);
    this.name = "TicketNotFoundError";
  }
}

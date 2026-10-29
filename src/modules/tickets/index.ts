import { prisma } from "../../lib/prisma.js";
import { PrismaTicketRepository } from "./prisma-ticket.repository.js";
import type { TicketRepository } from "./ticket.repository.js";

export const ticketRepository: TicketRepository = new PrismaTicketRepository(prisma);
export type * from "./ticket.dto.js";
export * from "./ticket.repository.js";

import { z } from "zod";

export const ticketStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]);
export const ticketPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const ticketIdSchema = z.uuid();

const fields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().nullable(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
};

export const createTicketSchema = z.strictObject({
  title: fields.title,
  description: fields.description.default(null),
  status: fields.status.default("OPEN"),
  priority: fields.priority.default("MEDIUM"),
});

export const updateTicketSchema = z.strictObject({
  title: fields.title.optional(),
  description: fields.description.optional(),
  status: fields.status.optional(),
  priority: fields.priority.optional(),
}).refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "Au moins un champ doit être fourni",
});

// Only decimal integer strings are accepted, not booleans, blanks or fractions.
const positiveInteger = z.union([
  z.number(),
  z.string().regex(/^\d+$/).transform(Number),
]).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

export const listTicketsSchema = z.strictObject({
  page: positiveInteger.default(1),
  limit: positiveInteger.pipe(z.number().max(100)).default(20),
  status: fields.status.optional(),
  priority: fields.priority.optional(),
}).refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
  message: "Pagination trop grande",
  path: ["page"],
});

export type CreateTicketDto = z.input<typeof createTicketSchema>;
export type UpdateTicketDto = z.input<typeof updateTicketSchema>;
export type ListTicketsDto = z.input<typeof listTicketsSchema>;

export interface TicketDto {
  id: string;
  title: string;
  description: string | null;
  status: z.infer<typeof ticketStatusSchema>;
  priority: z.infer<typeof ticketPrioritySchema>;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListingDto {
  items: TicketDto[];
  total: number;
  page: number;
  limit: number;
}

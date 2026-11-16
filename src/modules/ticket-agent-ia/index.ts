import "dotenv/config";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AiError } from "../ai/ai.service.js";
import { createAiService } from "../ai/config.js";
import { loadCatalog } from "./catalog.js";
import { TicketAgentIa } from "./agent.js";
import { PrismaTicketAgentRepository } from "./prisma.repository.js";
import { TicketAiWorker } from "./worker.js";
import { createTicketResultWaiter } from "./wait-for-result.js";

const flag = z.enum(["true", "false"]).default("false").transform(value => value === "true");
const flags = z.object({
  TICKET_AI_ENABLED: flag,
  TICKET_AI_AUTONOMOUS: flag,
  TICKET_AI_ALLOW_EMPTY_CATALOG_CLOSURE: flag,
}).safeParse(process.env);
if (!flags.success) throw new AiError("CONFIGURATION");
export const ticketAiEnabled = flags.data.TICKET_AI_ENABLED;
export const ticketAgentRepository = new PrismaTicketAgentRepository(prisma);
export const waitForTicketResult = ticketAiEnabled ? createTicketResultWaiter(async ticketId => {
  const job = await prisma.ticketAiJob.findUnique({ where: { ticketId }, select: { status: true, attempts: true } });
  if (!job) return true;
  return job.status !== "RUNNING" && (job.status !== "PENDING" || job.attempts > 0);
}) : undefined;
export const ticketAiWorker = ticketAiEnabled
  ? new TicketAiWorker(ticketAgentRepository, new TicketAgentIa(
    createAiService(process.env), loadCatalog(), flags.data.TICKET_AI_AUTONOMOUS,
    flags.data.TICKET_AI_ALLOW_EMPTY_CATALOG_CLOSURE,
  ))
  : undefined;

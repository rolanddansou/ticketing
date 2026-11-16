import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client.js";
import { TicketNotFoundError } from "../tickets/ticket.repository.js";
import { ProposalConflictError, type TicketAgentRepository, type ClaimedJob, type Proposal } from "./repository.js";

const release = { leaseUntil: null, leaseToken: null };
const owns = (job: ClaimedJob, now: Date) => ({
  ticketId: job.ticketId, status: "RUNNING" as const, leaseToken: job.leaseToken, leaseUntil: { gt: now },
});
const eligibleTicket = (id: string, revision: number) => ({ id, revision, status: "OPEN" as const });

export class PrismaTicketAgentRepository implements TicketAgentRepository {
  constructor(private readonly db: PrismaClient) {}

  async claim(now: Date): Promise<ClaimedJob | null> {
    await this.db.ticketAiJob.updateMany({
      where: { status: "RUNNING", leaseUntil: { lte: now }, attempts: { gte: 3 } },
      data: { ...release, status: "FAILED", errorCode: "LEASE_EXPIRED" },
    });
    const where: Prisma.TicketAiJobWhereInput = {
      attempts: { lt: 3 },
      OR: [{ status: "PENDING", availableAt: { lte: now } }, { status: "RUNNING", leaseUntil: { lte: now } }],
    };
    return this.db.$transaction(async tx => {
      const job = await tx.ticketAiJob.findFirst({ where, orderBy: [{ availableAt: "asc" }, { ticketId: "asc" }], include: { ticket: true } });
      if (!job) return null;
      const condition = { AND: [where, { ticketId: job.ticketId, attempts: job.attempts }] };
      if (job.ticket.status !== "OPEN" || job.ticket.revision !== job.revision) {
        await tx.ticketAiJob.updateMany({ where: condition, data: { ...release, status: "STALE" } });
        return null;
      }
      const leaseToken = randomUUID();
      const result = await tx.ticketAiJob.updateMany({
        where: condition,
        data: { status: "RUNNING", leaseToken, leaseUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
      });
      return result.count ? { ticketId: job.ticketId, revision: job.revision, attempts: job.attempts + 1,
        leaseToken, title: job.ticket.title, description: job.ticket.description } : null;
    });
  }

  async finish(job: ClaimedJob, proposal: Proposal, now: Date): Promise<void> {
    await this.db.$transaction(async tx => {
      const claimed = await tx.ticketAiJob.updateMany({
        where: owns(job, now),
        data: { ...release, status: proposal.approved ? "RESOLVED" : "PROPOSED", draft: proposal.approved ? null : proposal.draft, errorCode: null },
      });
      if (!claimed.count) return;
      if (!await this.apply(tx, job.ticketId, job.revision, proposal.approved && {
        ...proposal.approved, source: "AI", actorId: null, now,
      })) {
        await tx.ticketAiJob.update({ where: { ticketId: job.ticketId }, data: { status: "STALE", draft: null } });
      }
    });
  }

  async fail(job: ClaimedJob, code: string, next: Date | null, now: Date): Promise<void> {
    await this.db.ticketAiJob.updateMany({
      where: owns(job, now),
      data: { ...release, status: next ? "PENDING" : "FAILED", errorCode: code, availableAt: next ?? now },
    });
  }

  async decide(ticketId: string, actorId: string, decision: "accept" | "reject", text?: string): Promise<void> {
    await this.db.$transaction(async tx => {
      const job = await tx.ticketAiJob.findUnique({ where: { ticketId } });
      if (!job) {
        if (!await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true } })) throw new TicketNotFoundError(ticketId);
        throw new ProposalConflictError();
      }
      if (job.status !== "PROPOSED" || !job.draft) throw new ProposalConflictError();
      const changed = await tx.ticketAiJob.updateMany({
        where: { ticketId, status: "PROPOSED" },
        data: { status: decision === "accept" ? "RESOLVED" : "REJECTED", draft: null },
      });
      if (!changed.count || !await this.apply(tx, ticketId, job.revision, decision === "accept" ? {
        text: text ?? job.draft, source: "HUMAN", procedureId: null, actorId, now: new Date(),
      } : undefined)) throw new ProposalConflictError();
    });
  }

  private async apply(tx: Prisma.TransactionClient, id: string, revision: number, resolution?: {
    text: string; source: "AI" | "HUMAN"; procedureId: string | null; actorId: string | null; now: Date;
  }): Promise<boolean> {
    const where = eligibleTicket(id, revision);
    const ticket = await tx.ticket.findFirst({ where, select: { updatedAt: true } });
    if (!ticket) return false;
    // The conditional write serializes the decision with ordinary ticket edits.
    const data: Prisma.TicketUncheckedUpdateManyInput = resolution ? {
      status: "CLOSED", revision: { increment: 1 }, resolveById: resolution.actorId,
      resolutionText: resolution.text, resolutionSource: resolution.source,
      resolvedAt: resolution.now, resolutionProcedureId: resolution.procedureId,
    } : { revision: { increment: 0 }, updatedAt: ticket.updatedAt };
    return (await tx.ticket.updateMany({ where, data })).count === 1;
  }
}

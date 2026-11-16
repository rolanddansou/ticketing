export interface ClaimedJob {
  ticketId: string;
  leaseToken: string;
  revision: number;
  attempts: number;
  title: string;
  description: string | null;
}
export interface Proposal { draft: string; requiresResolutionText?: boolean; approved?: { text: string; procedureId: string | null } }
export interface Resolution { text: string; source: "HUMAN" | "AI"; resolvedAt: string; procedureId: string | null }

export interface TicketAgentRepository {
  claim(now: Date): Promise<ClaimedJob | null>;
  finish(job: ClaimedJob, proposal: Proposal, now: Date): Promise<void>;
  fail(job: ClaimedJob, code: string, next: Date | null, now: Date): Promise<void>;
  decide(ticketId: string, actorId: string, decision: "accept" | "reject", text?: string): Promise<void>;
}

export class ProposalConflictError extends Error {}
export class ProposalResolutionRequiredError extends Error {}

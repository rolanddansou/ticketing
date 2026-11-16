import { AiError } from "../ai/ai.service.js";
import type { TicketAgentIa } from "./agent.js";
import type { TicketAgentRepository } from "./repository.js";

export class TicketAiWorker {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;

  constructor(private readonly repository: TicketAgentRepository, private readonly agent: Pick<TicketAgentIa, "analyze">) {}

  async tick(now = new Date()): Promise<void> {
    const job = await this.repository.claim(now);
    if (!job) return;
    let proposal;
    try {
      proposal = await this.agent.analyze(job);
    } catch (error) {
      const code = error instanceof AiError ? error.code : "ANALYSIS_FAILED";
      const transient = code === "TIMEOUT" || code === "RATE_LIMITED" || code === "UNAVAILABLE";
      const failedAt = new Date();
      const delay = [60_000, 300_000][job.attempts - 1];
      await this.repository.fail(job, code, transient && delay ? new Date(failedAt.getTime() + delay) : null, failedAt);
      console.warn("Ticket AI analysis failed", { ticketId: job.ticketId, code });
      return;
    }
    await this.repository.finish(job, proposal, new Date());
  }

  start(): void {
    if (this.timer) return;
    const run = () => {
      if (this.pending) return;
      this.pending = this.tick().catch(() => console.error("Ticket AI queue failed")).finally(() => { this.pending = undefined; });
    };
    this.timer = setInterval(run, 1000);
    this.timer.unref();
    run();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.pending;
  }
}

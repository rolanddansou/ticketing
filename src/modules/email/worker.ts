import type { OutboxRepository } from "./outbox.repository.js";
import type { EmailProvider } from "./email-provider.js";
import { EmailEncryption } from "./encryption.js";
export class OutboxWorker {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  constructor(private readonly repository: OutboxRepository, private readonly provider: EmailProvider, private readonly encryption: EmailEncryption) {}
  async tick(now = new Date()): Promise<void> {
    const item = await this.repository.claim(now);
    if (!item) return;
    if (item.attempts > 5 || !await this.repository.isValid(item, now)) { await this.repository.finish(item, now, false); return; }
    try {
      await this.provider.send(this.encryption.decrypt(item.payload));
    } catch {
      console.error("Email delivery failed", { outboxId: item.id, attempt: item.attempts });
      const delay = [1, 5, 15, 60][item.attempts - 1];
      const next = delay ? new Date(now.getTime() + delay * 60000) : null;
      if (!next || next >= item.expiresAt) await this.repository.finish(item, now, false);
      else await this.repository.retry(item, next);
      return;
    }
    await this.repository.finish(item, new Date(), true);
  }
  start(): void {
    if (this.timer) return;
    const run = () => {
      if (this.pending) return;
      this.pending = this.tick().catch(() => { console.error("Email outbox processing failed"); }).finally(() => { this.pending = undefined; });
    };
    this.timer = setInterval(run, 1000); this.timer.unref(); run();
  }
  async stop(): Promise<void> { if (this.timer) clearInterval(this.timer); this.timer = undefined; await this.pending; }
}

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { OutboxRepository, OutboxItem } from "./outbox.repository.js";
export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly client: PrismaClient) {}
  async claim(now: Date): Promise<OutboxItem | null> {
    const where = { payload: { not: null }, deliveredAt: null, abandonedAt: null, availableAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] };
    const item = await this.client.emailOutbox.findFirst({ where, orderBy: [{ availableAt: "asc" }, { id: "asc" }] });
    if (!item?.payload) return null;
    const lockToken = randomUUID();
    const result = await this.client.emailOutbox.updateMany({ where: { ...where, id: item.id, attempts: item.attempts }, data: {
      lockToken, lockedUntil: new Date(now.getTime() + 60000), attempts: { increment: 1 },
    } });
    return result.count ? { ...item, payload: item.payload, attempts: item.attempts + 1, lockToken } : null;
  }
  async isValid(item: OutboxItem, now: Date): Promise<boolean> {
    if (item.expiresAt <= now) return false;
    if (!item.actionTokenId) return true;
    const token = await this.client.actionToken.findUnique({ where: { id: item.actionTokenId }, include: { user: true } });
    return !!token && !token.consumedAt && token.expiresAt > now && token.user.status === (token.type === "INVITATION" ? "INVITED" : "ACTIVE");
  }
  async finish(item: OutboxItem, now: Date, sent: boolean): Promise<void> {
    await this.client.emailOutbox.updateMany({ where: { id: item.id, lockToken: item.lockToken }, data: {
      payload: null, lockToken: null, lockedUntil: null, ...(sent ? { deliveredAt: now } : { abandonedAt: now }),
    } });
  }
  async retry(item: OutboxItem, availableAt: Date): Promise<void> {
    await this.client.emailOutbox.updateMany({ where: { id: item.id, lockToken: item.lockToken }, data: { availableAt, lockedUntil: null, lockToken: null } });
  }
}

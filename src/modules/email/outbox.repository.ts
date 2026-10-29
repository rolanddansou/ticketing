export interface OutboxItem { id: string; payload: string; actionTokenId: string | null; expiresAt: Date; attempts: number; lockToken: string }
export interface OutboxRepository {
  claim(now: Date): Promise<OutboxItem | null>;
  isValid(item: OutboxItem, now: Date): Promise<boolean>;
  finish(item: OutboxItem, now: Date, sent: boolean): Promise<void>;
  retry(item: OutboxItem, availableAt: Date): Promise<void>;
}

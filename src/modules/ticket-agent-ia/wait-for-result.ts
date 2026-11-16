import { setTimeout as delay } from "node:timers/promises";
import type { TicketDto } from "../tickets/ticket.dto.js";

export type WaitForTicketResult = (ticketId: string, read: () => Promise<TicketDto | null>) => Promise<TicketDto | null>;

export function createTicketResultWaiter(isFinished: (ticketId: string) => Promise<boolean>, waitMs = 5000): WaitForTicketResult {
  return async (ticketId, read) => {
    const stop = new AbortController();
    async function poll() {
      while (!stop.signal.aborted) {
        if (await isFinished(ticketId)) {
          return stop.signal.aborted ? null : read();
        }
        await delay(250, undefined, { signal: stop.signal });
      }
      return null;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<null>(resolve => { timer = setTimeout(resolve, waitMs, null); });
      return await Promise.race([poll(), deadline]);
    } catch {
      // Creation has already committed. A failed status read must not turn it into a failed POST.
      return null;
    } finally {
      clearTimeout(timer);
      stop.abort();
    }
  };
}

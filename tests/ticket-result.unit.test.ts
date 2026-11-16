import assert from "node:assert/strict";
import { test } from "node:test";
import { createTicketResultWaiter } from "../src/modules/ticket-agent-ia/wait-for-result.js";
import type { TicketDto } from "../src/modules/tickets/ticket.dto.js";

test("ticket creation can return the already available AI result", async () => {
  const result = { status: "CLOSED" } as TicketDto;
  const wait = createTicketResultWaiter(async id => id === "ticket");
  assert.equal(await wait("ticket", async () => result), result);
});

test("the wait is bounded even when the database status read stalls", async () => {
  let finish!: (finished: boolean) => void;
  const wait = createTicketResultWaiter(() => new Promise(resolve => { finish = resolve; }), 20);
  let reads = 0;
  assert.equal(await wait("ticket", async () => { reads++; return null; }), null);
  finish(true);
  await Promise.resolve();
  assert.equal(reads, 0);
});

test("database errors after creation fall back to the created ticket", async () => {
  const wait = createTicketResultWaiter(async () => { throw new Error("database unavailable"); });
  assert.equal(await wait("ticket", async () => assert.fail("Unexpected read")), null);
});

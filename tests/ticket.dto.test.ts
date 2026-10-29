import assert from "node:assert/strict";
import { test } from "node:test";
import { createTicketSchema, updateTicketSchema, listTicketsSchema, ticketIdSchema } from "../src/modules/tickets/ticket.dto.js";

test("create trims title and applies defaults", () => {
  assert.deepEqual(createTicketSchema.parse({ title: "  Support  " }), {
    title: "Support", description: null, status: "OPEN", priority: "MEDIUM",
  });
});

test("create rejects invalid fields and protected properties", () => {
  for (const input of [
    {}, { title: " " }, { title: "x".repeat(201) }, { title: null },
    { title: "OK", status: "INVALID" }, { title: "OK", priority: "INVALID" },
    ...["id", "createdAt", "updatedAt", "unknown"].map(key => ({ title: "OK", [key]: "value" })),
  ]) assert.equal(createTicketSchema.safeParse(input).success, false);
});

test("update is partial, supports null and rejects empty or unknown changes", () => {
  assert.deepEqual(updateTicketSchema.parse({ title: " New " }), { title: "New" });
  assert.deepEqual(updateTicketSchema.parse({ description: null }), { description: null });
  for (const input of [{}, { title: undefined }, { title: " " }, { status: null }, { id: "x" }, { updatedAt: "x" }]) {
    assert.equal(updateTicketSchema.safeParse(input).success, false);
  }
});

test("listing defaults, integer strings and filters", () => {
  assert.deepEqual(listTicketsSchema.parse({}), { page: 1, limit: 20 });
  assert.deepEqual(listTicketsSchema.parse({ page: "2", limit: "100", status: "CLOSED", priority: "HIGH" }), {
    page: 2, limit: 100, status: "CLOSED", priority: "HIGH",
  });
  for (const input of [{ page: 0 }, { page: 1.5 }, { page: "" }, { page: true }, { limit: 101 }, { limit: null }, { page: "1e2" }, { status: "bad" }, { other: 1 }, { page: Number.MAX_SAFE_INTEGER, limit: 100 }]) {
    assert.equal(listTicketsSchema.safeParse(input).success, false);
  }
});

test("ids must be UUIDs", () => {
  assert.equal(ticketIdSchema.safeParse("not-an-id").success, false);
  assert.equal(ticketIdSchema.safeParse("00000000-0000-4000-8000-000000000001").success, true);
});

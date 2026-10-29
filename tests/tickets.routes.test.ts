import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { createTicketsRouter } from "../src/routes/tickets.js";
import { errorHandler } from "../src/middlewares/error-handler.js";
import { TicketNotFoundError, TicketUserReferenceError, type TicketRepository } from "../src/modules/tickets/ticket.repository.js";
import type { TicketDto } from "../src/modules/tickets/ticket.dto.js";

test("ticket HTTP routes and error responses", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000002";
  const ticket: TicketDto = {
    id, title: "Support", description: null, status: "OPEN", priority: "MEDIUM",
    createdById: userId, assignedToId: null, resolveById: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  let calls = 0;
  let failure: Error | undefined;
  let missing = false;
  const check = () => { calls++; if (failure) throw failure; };
  const repository: TicketRepository = {
    async create(input) {
      check();
      assert.equal(input.title, "Support");
      assert.ok(input.createdById === userId || input.createdById === null);
      assert.equal(input.status, "OPEN");
      return { ...ticket, createdById: input.createdById ?? null };
    },
    async update(ticketId, input) {
      check();
      assert.equal(ticketId, id);
      assert.deepEqual(input, { assignedToId: null, status: "CLOSED" });
      return { ...ticket, ...input } as TicketDto;
    },
    async get(ticketId) { check(); assert.equal(ticketId, id); return missing ? null : ticket; },
    async listing(input) {
      check();
      assert.deepEqual(input, { page: 2, limit: 5, status: "OPEN", priority: "HIGH", createdById: userId, assignedToId: userId, resolveById: userId });
      return { items: [ticket], total: 6, page: 2, limit: 5 };
    },
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/tickets", createTicketsRouter(repository, (_req, res, next) => {
    res.locals.identity = { sessionId: id, user: { id: userId, name: "Admin", email: "admin@example.com", role: "SUPER_ADMIN", status: "ACTIVE", createdAt: ticket.createdAt } };
    next();
  }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/tickets`;
  const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    let response = await fetch(base, json("POST", { title: " Support " }));
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("location"), `/tickets/${id}`);
    assert.deepEqual(await response.json(), ticket);
    response = await fetch(`${base}/${id}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), ticket);
    response = await fetch(`${base}/${id}`, json("PATCH", { assignedToId: null, status: "CLOSED" }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "CLOSED");
    response = await fetch(`${base}?page=2&limit=5&status=OPEN&priority=HIGH&createdById=${userId}&assignedToId=${userId}&resolveById=${userId}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [ticket], total: 6, page: 2, limit: 5 });

    response = await fetch(base, json("POST", { title: "Support" }));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).createdById, userId);
    response = await fetch(base, json("POST", { title: "Support", createdById: null }));
    assert.equal(response.status, 400);

    const beforeInvalid = calls;
    for (const [url, options] of [
      [base, json("POST", {})],
      [base, json("POST", { title: "X", createdById: userId, unknown: true })],
      [`${base}/${id}`, json("PATCH", {})],
      [`${base}/${id}`, json("PATCH", { createdById: userId })],
      [`${base}/bad-id`, undefined],
      [`${base}/bad-id`, json("PATCH", { status: "CLOSED" })],
      [`${base}?limit=101`, undefined],
      [`${base}?status=INVALID`, undefined],
      [`${base}?page=1&page=2`, undefined],
      [`${base}?unknown=true`, undefined],
    ] as const) {
      response = await fetch(url, options);
      assert.equal(response.status, 400, url);
      assert.equal((await response.json()).error.message, "Requête invalide");
    }
    assert.equal(calls, beforeInvalid);
    response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    assert.equal(response.status, 400);
    response = await fetch(base, json("POST", { title: "x".repeat(1024 * 1024) }));
    assert.equal(response.status, 413);
    missing = true;
    response = await fetch(`${base}/${id}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { message: "Ticket introuvable" } });
    failure = new TicketNotFoundError(id);
    response = await fetch(`${base}/${id}`, json("PATCH", { status: "CLOSED", assignedToId: null }));
    assert.equal(response.status, 404);
    failure = new TicketUserReferenceError();
    response = await fetch(base, json("POST", { title: "Support" }));
    assert.equal(response.status, 422);
    response = await fetch(`${base}/${id}`, json("PATCH", { status: "CLOSED", assignedToId: null }));
    assert.equal(response.status, 422);
    failure = Object.assign(new Error("secret database credentials"), { code: "P2022" });
    const logs: unknown[][] = [];
    const originalLog = console.error;
    console.error = (...args: unknown[]) => { logs.push(args); };
    try {
      response = await fetch(`${base}/${id}`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { message: "Erreur interne du serveur" } });
      assert.equal(logs.length, 1);
      assert.match(JSON.stringify(logs), /P2022/);
      assert.doesNotMatch(JSON.stringify(logs), /secret database credentials/);
    } finally {
      console.error = originalLog;
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

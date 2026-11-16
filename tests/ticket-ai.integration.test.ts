import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { testDatabase } from "./support/database.js";
import { AiError, AiService } from "../src/modules/ai/ai.service.js";
import { TicketAgentIa } from "../src/modules/ticket-agent-ia/agent.js";
import { TicketAiWorker } from "../src/modules/ticket-agent-ia/worker.js";
import { PrismaTicketAgentRepository } from "../src/modules/ticket-agent-ia/prisma.repository.js";
import { ProposalConflictError, ProposalResolutionRequiredError } from "../src/modules/ticket-agent-ia/repository.js";
import { PrismaTicketRepository } from "../src/modules/tickets/prisma-ticket.repository.js";
import { TicketResolutionConflictError } from "../src/modules/tickets/ticket.repository.js";
import { createTicketsRouter } from "../src/routes/tickets.js";
import { errorHandler } from "../src/middlewares/error-handler.js";

test("Ticket AI queues, retries, recovers, scopes proposals and closes safely", async () => {
  const db = await testDatabase();
  try {
    const repo = new PrismaTicketRepository(db.prisma, true);
    const queue = new PrismaTicketAgentRepository(db.prisma);
    const owner = await db.prisma.user.create({ data: { name: "Owner", email: "owner@example.com" } });
    const reviewer = await db.prisma.user.create({ data: { name: "Reviewer", email: "agent@example.com", role: "AGENT" } });
    const create = (title: string, description?: string) => repo.create({ title, description, createdById: owner.id });
    await new PrismaTicketRepository(db.prisma).create({ title: "AI disabled" });
    await repo.create({ title: "Already closed", status: "CLOSED" });
    assert.equal(await db.prisma.ticketAiJob.count(), 0);
    // Force the nested job insert to fail and check that the ticket insert rolls back.
    const ddl = `ALTER TABLE "${db.schema}"."TicketAiJob"`;
    await db.pool.query(`${ddl} ADD CONSTRAINT ticket_ai_test_reject CHECK (false) NOT VALID`);
    try {
      await assert.rejects(create("Rolled back"));
      assert.equal(await db.prisma.ticket.count({ where: { title: "Rolled back" } }), 0);
    } finally { await db.pool.query(`${ddl} DROP CONSTRAINT ticket_ai_test_reject`); }

    const catalog = [{ id: "approved", title: "Known issue", description: "Exact match", resolutionText: "Approved resolution" }];
    let failure: AiError | undefined;
    let received = "";
    const ai = new AiService({ openai: { async generate(input) {
      if (failure) throw failure;
      received = input.user;
      return { text: JSON.stringify({ scope: "IT", draft: "Draft response", procedureId: "approved" }), model: "fake" };
    } } }, "openai");
    const manual = new TicketAiWorker(queue, new TicketAgentIa(ai, catalog, false));
    const auto = new TicketAiWorker(queue, new TicketAgentIa(ai, catalog, true));

    const ticket = await create("Manual", "alice@example.com token=private-value");
    assert.equal((await db.prisma.ticketAiJob.findUniqueOrThrow({ where: { ticketId: ticket.id } })).status, "PENDING");
    await manual.tick();
    assert.doesNotMatch(received, /alice@example.com|private-value/);
    assert.equal((await repo.get(ticket.id))?.aiProposal?.draft, "Draft response");
    assert.equal((await repo.get(ticket.id, { createdById: owner.id }))?.aiProposal, undefined);

    const app = express();
    app.use(express.json());
    app.use("/tickets", createTicketsRouter(repo, (req, res, next) => {
      const support = req.get("X-Test-Support") === "yes";
      res.locals.identity = {
        sessionId: "test", user: { id: support ? reviewer.id : owner.id, role: support ? "AGENT" : "USER",
          name: "Test", email: "test@example.com", status: "ACTIVE", createdAt: "" },
      };
      next();
    }, queue));
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}/tickets/${ticket.id}`;
      const accept = (support: boolean) => fetch(`${url}/ai-proposal/accept`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Test-Support": support ? "yes" : "no" },
        body: JSON.stringify({ resolutionText: "Edited solution" }),
      });
      const ownerView = await (await fetch(url)).json();
      assert.equal(ownerView.aiProposal, undefined);
      const supportView = await (await fetch(url, { headers: { "X-Test-Support": "yes" } })).json();
      assert.equal(supportView.aiProposal.draft, "Draft response");
      assert.equal((await accept(false)).status, 403);
      assert.equal((await accept(true)).status, 204);
      assert.equal((await accept(true)).status, 409);
      const closed = await (await fetch(url)).json();
      assert.equal(closed.status, "CLOSED");
      assert.equal(closed.resolution.text, "Edited solution");
      assert.equal(closed.resolution.source, "HUMAN");
      assert.equal(closed.resolveById, reviewer.id);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }

    const rejected = await create("Reject");
    await manual.tick();
    await queue.decide(rejected.id, reviewer.id, "reject");
    assert.equal((await repo.get(rejected.id))?.status, "OPEN");
    assert.equal((await repo.get(rejected.id))?.aiProposal, undefined);

    const edited = await create("Edited after proposal");
    await manual.tick();
    await repo.update(edited.id, { description: "A changed request" });
    assert.equal((await repo.get(edited.id))?.aiProposal, undefined);
    await assert.rejects(queue.decide(edited.id, reviewer.id, "accept"), ProposalConflictError);

    const acceptedDraft = await create("Accept without editing");
    await manual.tick();
    await queue.decide(acceptedDraft.id, reviewer.id, "accept");
    assert.equal((await repo.get(acceptedDraft.id))?.resolution?.text, "Draft response");

    const scoped = await create("Needs clarification");
    const job = await queue.claim(new Date());
    assert.ok(job);
    assert.equal(job.ticketId, scoped.id);
    await queue.finish(job, { draft: "Please clarify", requiresResolutionText: true }, new Date());
    await assert.rejects(queue.decide(scoped.id, reviewer.id, "accept"), ProposalResolutionRequiredError);
    assert.equal((await repo.get(scoped.id))?.status, "OPEN");
    await queue.decide(scoped.id, reviewer.id, "accept", "Verified resolution");
    assert.equal((await repo.get(scoped.id))?.resolution?.text, "Verified resolution");

    const eligible = await create("  Known ISSUE ", "Exact match");
    await auto.tick();
    const resolved = await repo.get(eligible.id);
    assert.equal(resolved?.status, "CLOSED");
    assert.equal(resolved.resolution?.text, "Approved resolution");
    assert.equal(resolved.resolution?.procedureId, "approved");
    assert.equal(resolved.resolution?.source, "AI");
    assert.equal(resolved.resolveById, null);
    await assert.rejects(repo.update(eligible.id, { resolveById: reviewer.id }), TicketResolutionConflictError);
    await assert.rejects(repo.update(ticket.id, { resolveById: null }), TicketResolutionConflictError);
    assert.equal((await repo.update(ticket.id, { status: "OPEN", resolveById: reviewer.id })).resolveById, null);
    assert.equal((await repo.get(ticket.id))?.resolution, undefined);
    const mismatch = await create("Known issue", "Different request");
    await auto.tick();
    assert.equal((await repo.get(mismatch.id))?.status, "OPEN");
    assert.ok((await repo.get(mismatch.id))?.aiProposal);

    const stale = await create("Changed while model ran");
    const now = new Date();
    const claims = await Promise.all([queue.claim(now), queue.claim(now)]);
    assert.equal(claims.filter(Boolean).length, 1);
    const original = claims.find(Boolean)!;
    assert.equal(original.ticketId, stale.id);
    const reclaimed = await queue.claim(new Date(now.getTime() + 61_000));
    assert.ok(reclaimed);
    assert.notEqual(reclaimed.leaseToken, original.leaseToken);
    await queue.finish(original, { draft: "Lease was lost" }, now);
    assert.equal((await repo.get(stale.id))?.aiProposal, undefined);
    await repo.update(stale.id, { title: "Human edit" });
    await queue.finish(reclaimed, { draft: "Old content" }, new Date(now.getTime() + 62_000));
    assert.equal((await db.prisma.ticketAiJob.findUniqueOrThrow({ where: { ticketId: stale.id } })).status, "STALE");
    await assert.rejects(queue.decide(stale.id, reviewer.id, "accept"), ProposalConflictError);

    const retry = await create("Retry");
    failure = new AiError("RATE_LIMITED");
    await manual.tick();
    const scheduled = await db.prisma.ticketAiJob.findUniqueOrThrow({ where: { ticketId: retry.id } });
    assert.equal(scheduled.status, "PENDING");
    assert.equal(scheduled.errorCode, "RATE_LIMITED");
    assert.ok(scheduled.availableAt.getTime() > Date.now());
    assert.equal(await queue.claim(new Date()), null);
    await db.prisma.ticketAiJob.update({ where: { ticketId: retry.id }, data: { availableAt: new Date(0) } });
    await manual.tick();
    const second = await db.prisma.ticketAiJob.findUniqueOrThrow({ where: { ticketId: retry.id } });
    assert.equal(second.attempts, 2);
    assert.ok(second.availableAt.getTime() - Date.now() > 290_000);
    await db.prisma.ticketAiJob.update({ where: { ticketId: retry.id }, data: { availableAt: new Date(0) } });
    await manual.tick();
    assert.equal((await db.prisma.ticketAiJob.findUniqueOrThrow({ where: { ticketId: retry.id } })).status, "FAILED");
    assert.equal((await repo.get(retry.id))?.status, "OPEN");

    const invalid = await create("Invalid AI output");
    failure = new AiError("INVALID_OUTPUT");
    await manual.tick();
    const invalidJob = await db.prisma.ticketAiJob.findUniqueOrThrow({ where: { ticketId: invalid.id } });
    assert.equal(invalidJob.status, "FAILED");
    assert.equal(invalidJob.attempts, 1);
    assert.equal((await repo.get(invalid.id))?.status, "OPEN");
  } finally { await db.close(); }
});

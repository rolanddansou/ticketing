import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { ZodError } from "zod";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaTicketRepository } from "../src/modules/tickets/prisma-ticket.repository.js";
import { TicketNotFoundError } from "../src/modules/tickets/ticket.repository.js";
import type { CreateTicketDto } from "../src/modules/tickets/ticket.dto.js";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL est obligatoire et doit désigner une base PostgreSQL de test dédiée");
}

const schema = `ticket_test_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(process.env.TEST_DATABASE_URL);
databaseUrl.searchParams.set("schema", schema);
const pool = new Pool({ connectionString: databaseUrl.toString(), connectionTimeoutMillis: 5000 });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl.toString() }, { schema }) });
const repo = new PrismaTicketRepository(prisma);
let schemaCreated = false;

before(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
    stdio: "pipe",
    timeout: 30000,
  });
});

after(async () => {
  try {
    await prisma.$disconnect();
  } finally {
    try {
      if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await pool.end();
    }
  }
});

test("repository lifecycle, validation, filters and pagination", async () => {
  const first = await repo.create({ title: "  First  ", description: "Details" });
  assert.equal(first.title, "First");
  assert.equal(first.status, "OPEN");
  assert.equal(first.priority, "MEDIUM");
  assert.equal(new Date(first.createdAt).toISOString(), first.createdAt);
  assert.equal(new Date(first.updatedAt).toISOString(), first.updatedAt);
  assert.deepEqual(await repo.get(first.id), first);

  const updated = await repo.update(first.id, { title: "Changed", status: "CLOSED" });
  assert.equal(updated.description, "Details");
  assert.equal(updated.priority, "MEDIUM");
  assert.equal(updated.createdAt, first.createdAt);
  assert.ok(updated.updatedAt >= first.updatedAt);
  assert.equal((await repo.update(first.id, { description: null })).description, null);
  assert.equal((await repo.update(first.id, { status: "OPEN" })).status, "OPEN");

  const missing = randomUUID();
  assert.equal(await repo.get(missing), null);
  await assert.rejects(repo.update(missing, { title: "Missing" }), TicketNotFoundError);
  await assert.rejects(repo.get("invalid"), ZodError);
  await assert.rejects(repo.update("invalid", { title: "Valid" }), ZodError);
  await assert.rejects(repo.update(first.id, {}), ZodError);
  await assert.rejects(repo.create({ title: " " }), ZodError);
  await assert.rejects(repo.create({ title: "X", id: randomUUID() } as CreateTicketDto), ZodError);
  await assert.rejects(repo.listing({ limit: 101 }), ZodError);

  const second = await repo.create({ title: "Second", status: "CLOSED", priority: "HIGH" });
  const third = await repo.create({ title: "Third", status: "CLOSED", priority: "HIGH" });
  await repo.create({ title: "Fourth", status: "OPEN", priority: "HIGH" });
  // Equal timestamps exercise the UUID tie-breaker independently of timing.
  const timestamp = new Date("2026-01-01T00:00:00Z");
  await prisma.ticket.updateMany({ where: { id: { in: [second.id, third.id] } }, data: { createdAt: timestamp } });
  const ids = [second.id, third.id].sort().reverse();
  const page1 = await repo.listing({ page: "1", limit: "1", status: "CLOSED", priority: "HIGH" });
  assert.equal(page1.total, 2);
  assert.equal(page1.page, 1);
  assert.equal(page1.limit, 1);
  assert.deepEqual(page1.items.map(item => item.id), [ids[0]]);
  const page2 = await repo.listing({ page: 2, limit: 1, status: "CLOSED", priority: "HIGH" });
  assert.deepEqual(page2.items.map(item => item.id), [ids[1]]);
  const beyond = await repo.listing({ page: 3, limit: 1, status: "CLOSED", priority: "HIGH" });
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.total, 2);
  assert.equal((await repo.listing({ status: "CLOSED" })).total, 2);
  assert.equal((await repo.listing({ priority: "HIGH" })).total, 3);
  const all = await repo.listing({});
  assert.equal(all.total, 4);
  assert.equal(all.page, 1);
  assert.equal(all.limit, 20);
  assert.equal(all.items[0].title, "Fourth");
  assert.equal((await repo.listing({ status: "IN_PROGRESS" })).total, 0);

  // Technical failures must not become TicketNotFoundError or null.
  await pool.query(`ALTER TABLE "${schema}"."Ticket" RENAME TO "UnavailableTicket"`);
  try {
    await assert.rejects(repo.update(first.id, { title: "Fails" }), error => !(error instanceof TicketNotFoundError));
    await assert.rejects(repo.get(first.id));
  } finally {
    await pool.query(`ALTER TABLE "${schema}"."UnavailableTicket" RENAME TO "Ticket"`);
  }
});

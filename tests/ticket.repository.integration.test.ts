import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { ZodError } from "zod";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaTicketRepository } from "../src/modules/tickets/prisma-ticket.repository.js";
import { TicketNotFoundError, TicketUserReferenceError } from "../src/modules/tickets/ticket.repository.js";
import { PrismaUserRepository } from "../src/modules/users/prisma-user.repository.js";
import { UserNotFoundError, UserEmailAlreadyExistsError } from "../src/modules/users/user.repository.js";
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

test("migration refuses populated Ticket without data loss and accepts empty Ticket", async () => {
  const migrationSchema = `migration_test_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  const initial = readFileSync("prisma/migrations/20261029095052_init_ticket/migration.sql", "utf8");
  const migration = readFileSync("prisma/migrations/20261029110000_add_users_and_ticket_relations/migration.sql", "utf8");
  try {
    await client.query(`CREATE SCHEMA "${migrationSchema}"`);
    await client.query(`SET search_path TO "${migrationSchema}"`);
    await client.query(initial);
    const ticketId = randomUUID();
    await client.query('INSERT INTO "Ticket" (id, title, "updatedAt") VALUES ($1, $2, now())', [ticketId, "Preserve me"]);
    await assert.rejects(client.query(migration), /Ticket must be empty/);
    await client.query("ROLLBACK");
    const preserved = await client.query('SELECT id, title FROM "Ticket"');
    assert.deepEqual(preserved.rows, [{ id: ticketId, title: "Preserve me" }]);
    assert.equal((await client.query("SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename = 'User'", [migrationSchema])).rowCount, 0);
    assert.equal((await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Ticket' AND column_name = 'createdById'", [migrationSchema])).rowCount, 0);
    await client.query('DELETE FROM "Ticket" WHERE id = $1', [ticketId]);
    await client.query(migration);
    assert.equal((await client.query('SELECT * FROM "User"')).rowCount, 0);
  } finally {
    await client.query("ROLLBACK");
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA IF EXISTS "${migrationSchema}" CASCADE`);
    client.release();
  }
});

test("legacy recovery preserves tickets after a failed deploy and can be rerun", async () => {
  const legacySchema = `legacy_test_${randomUUID().replaceAll("-", "")}`;
  const legacyUrl = new URL(databaseUrl);
  legacyUrl.searchParams.set("schema", legacySchema);
  const client = await pool.connect();
  const run = (...args: string[]) => execFileSync(process.execPath, args, {
    env: { ...process.env, DATABASE_URL: legacyUrl.toString() }, stdio: "pipe", timeout: 30000,
  });
  try {
    await client.query(`CREATE SCHEMA "${legacySchema}"`);
    await client.query(`SET search_path TO "${legacySchema}"`);
    await client.query(readFileSync("prisma/migrations/20261029095052_init_ticket/migration.sql", "utf8"));
    run("node_modules/prisma/build/index.js", "migrate", "resolve", "--applied", "20261029095052_init_ticket");
    const id = randomUUID();
    await client.query('INSERT INTO "Ticket" (id, title, "updatedAt") VALUES ($1, $2, now())', [id, "Keep this ticket"]);
    assert.throws(() => run("node_modules/prisma/build/index.js", "migrate", "deploy"));
    run("--import", "tsx", "scripts/recover-legacy-tickets.ts");
    assert.deepEqual((await client.query('SELECT id, title, "createdById" FROM "Ticket"')).rows, [
      { id, title: "Keep this ticket", createdById: null },
    ]);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count, 3);
    run("--import", "tsx", "scripts/recover-legacy-tickets.ts");
    assert.equal((await client.query('SELECT count(*)::int AS count FROM "Ticket"')).rows[0].count, 1);
  } finally {
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA IF EXISTS "${legacySchema}" CASCADE`);
    client.release();
  }
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
  const users = new PrismaUserRepository(prisma);
  const creator = await users.create({ name: " Alice ", email: " Alice@Example.com " });
  const agent = await users.create({ name: "Agent", email: "agent@example.com", role: "AGENT" });
  const viewer = await users.create({ name: "Viewer", email: "viewer@example.com", role: "VIEWER" });
  assert.equal(creator.name, "Alice");
  assert.equal(creator.email, "alice@example.com");
  assert.equal(creator.role, "EMPLOYEE");
  assert.equal(new Date(creator.createdAt).toISOString(), creator.createdAt);
  assert.deepEqual(await users.get(creator.id), creator);
  assert.equal(await users.get(randomUUID()), null);
  await assert.rejects(users.get("bad"), ZodError);
  await assert.rejects(users.update("bad", { name: "A" }), ZodError);
  await assert.rejects(users.update(creator.id, {}), ZodError);
  await assert.rejects(users.create({ name: "Duplicate", email: " ALICE@EXAMPLE.COM " }), UserEmailAlreadyExistsError);
  await assert.rejects(users.update(agent.id, { email: "ALICE@example.com" }), UserEmailAlreadyExistsError);
  await assert.rejects(users.update(randomUUID(), { name: "Missing" }), UserNotFoundError);
  const changed = await users.update(creator.id, { name: "New Alice" });
  assert.equal(changed.email, creator.email);
  assert.equal(changed.createdAt, creator.createdAt);
  assert.equal((await users.listing({ role: "AGENT" })).total, 1);
  const userPage = await users.listing({ page: "2", limit: "1" });
  assert.equal(userPage.total, 3);
  assert.equal(userPage.items.length, 1);
  assert.equal((await users.listing({ page: 4, limit: 1 })).items.length, 0);
  await prisma.user.updateMany({ data: { createdAt: new Date("2026-01-01T00:00:00Z") } });
  assert.deepEqual((await users.listing({})).items.map(user => user.id), [creator.id, agent.id, viewer.id].sort().reverse());

  const createdById = creator.id;
  const first = await repo.create({ title: "  First  ", description: "Details", createdById });
  assert.equal(first.createdById, createdById);
  assert.equal(first.assignedToId, null);
  assert.equal(first.resolveById, null);
  const assigned = await repo.update(first.id, { assignedToId: agent.id, resolveById: viewer.id });
  assert.equal(assigned.assignedToId, agent.id);
  assert.equal(assigned.resolveById, viewer.id);
  assert.equal(assigned.status, "OPEN");
  for (const field of ["createdById", "assignedToId", "resolveById"]) {
    await assert.rejects(repo.create({ title: "Bad reference", createdById, [field]: randomUUID() }), TicketUserReferenceError);
  }
  await assert.rejects(repo.update(first.id, { assignedToId: randomUUID() }), TicketUserReferenceError);
  await assert.rejects(repo.update(first.id, { resolveById: randomUUID() }), TicketUserReferenceError);
  await assert.rejects(repo.update(first.id, { createdById: agent.id } as never), ZodError);
  for (const id of [creator.id, agent.id, viewer.id]) {
    await assert.rejects(prisma.user.delete({ where: { id } }));
  }
  assert.equal((await repo.listing({ createdById, assignedToId: agent.id, resolveById: viewer.id, status: "OPEN", priority: "MEDIUM" })).total, 1);
  assert.equal((await repo.listing({ assignedToId: viewer.id })).total, 0);
  const cleared = await repo.update(first.id, { assignedToId: null, resolveById: null });
  assert.equal(cleared.assignedToId, null);
  assert.equal(cleared.resolveById, null);
  assert.equal(first.title, "First");
  assert.equal(first.status, "OPEN");
  assert.equal(first.priority, "MEDIUM");
  assert.equal(new Date(first.createdAt).toISOString(), first.createdAt);
  assert.equal(new Date(first.updatedAt).toISOString(), first.updatedAt);
  assert.deepEqual(await repo.get(first.id), cleared);

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
  await assert.rejects(repo.create({ title: " ", createdById }), ZodError);
  await assert.rejects(repo.create({ title: "X", createdById, id: randomUUID() } as CreateTicketDto), ZodError);
  await assert.rejects(repo.listing({ limit: 101 }), ZodError);

  const second = await repo.create({ title: "Second", status: "CLOSED", priority: "HIGH", createdById });
  const third = await repo.create({ title: "Third", status: "CLOSED", priority: "HIGH", createdById });
  await repo.create({ title: "Fourth", status: "OPEN", priority: "HIGH", createdById: agent.id });
  assert.equal((await repo.listing({ createdById })).total, 3);
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
  const anonymous = await repo.create({ title: "Without user" });
  assert.equal(anonymous.createdById, null);
  assert.equal((await repo.get(anonymous.id))?.createdById, null);
  assert.equal((await repo.create({ title: "Explicit null", createdById: null })).createdById, null);

  // Technical failures must not become TicketNotFoundError or null.
  await pool.query(`ALTER TABLE "${schema}"."Ticket" RENAME TO "UnavailableTicket"`);
  try {
    await assert.rejects(repo.update(first.id, { title: "Fails" }), error => !(error instanceof TicketNotFoundError));
    await assert.rejects(repo.get(first.id));
  } finally {
    await pool.query(`ALTER TABLE "${schema}"."UnavailableTicket" RENAME TO "Ticket"`);
  }
  await pool.query(`ALTER TABLE "${schema}"."User" RENAME TO "UnavailableUser"`);
  try {
    await assert.rejects(users.update(creator.id, { name: "Fails" }), error => !(error instanceof UserNotFoundError) && !(error instanceof UserEmailAlreadyExistsError));
    await assert.rejects(users.get(creator.id));
  } finally {
    await pool.query(`ALTER TABLE "${schema}"."UnavailableUser" RENAME TO "User"`);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { testDatabase } from "./support/database.js";
import { EmailEncryption } from "../src/modules/email/encryption.js";
import { FakeEmailProvider } from "../src/modules/email/email-provider.js";
import { PrismaOutboxRepository } from "../src/modules/email/prisma-outbox.repository.js";
import { OutboxWorker } from "../src/modules/email/worker.js";

test("encrypted outbox sends, retries, expires, abandons and resumes after a lease", async () => {
  const db = await testDatabase();
  try {
    const encryption = new EmailEncryption("ab".repeat(32));
    const provider = new FakeEmailProvider();
    const repository = new PrismaOutboxRepository(db.prisma);
    const worker = new OutboxWorker(repository, provider, encryption);
    const now = new Date();
    const message = { to: "recipient@example.com", subject: "Test", text: "secret token", html: "<p>secret token</p>" };
    const payload = encryption.encrypt(message);
    assert.equal(payload.includes("secret"), false);
    assert.deepEqual(encryption.decrypt(payload), message);
    assert.throws(() => new EmailEncryption("cd".repeat(32)).decrypt(payload));
    const insert = (expiresAt = new Date(now.getTime() + 86400_000)) => db.prisma.emailOutbox.create({ data: { payload, expiresAt, availableAt: now } });
    const first = await insert();
    await worker.tick(now);
    assert.equal(provider.messages.length, 1);
    assert.equal((await db.prisma.emailOutbox.findUniqueOrThrow({ where: { id: first.id } })).payload, null);
    const expired = await insert(new Date(0)); await worker.tick(now);
    assert.ok((await db.prisma.emailOutbox.findUniqueOrThrow({ where: { id: expired.id } })).abandonedAt);
    const retry = await insert(); provider.fail = true;
    const log = console.error; const logs: unknown[][] = []; console.error = (...args) => { logs.push(args); };
    try { await worker.tick(now); } finally { console.error = log; }
    assert.doesNotMatch(JSON.stringify(logs), /secret token|recipient@example.com/);
    assert.equal((await db.prisma.emailOutbox.findUniqueOrThrow({ where: { id: retry.id } })).attempts, 1);
    provider.fail = false; await worker.tick(new Date(now.getTime() + 60001));
    assert.equal(provider.messages.length, 2);
    const crashed = await insert();
    assert.ok(await repository.claim(now));
    await new OutboxWorker(repository, provider, encryption).tick(new Date(now.getTime() + 60001));
    assert.ok((await db.prisma.emailOutbox.findUniqueOrThrow({ where: { id: crashed.id } })).deliveredAt);
    const abandoned = await insert();
    await db.prisma.emailOutbox.update({ where: { id: abandoned.id }, data: { attempts: 4 } });
    provider.fail = true; console.error = () => {};
    try { await worker.tick(now); } finally { console.error = log; }
    const row = await db.prisma.emailOutbox.findUniqueOrThrow({ where: { id: abandoned.id } });
    assert.equal(row.attempts, 5); assert.equal(row.payload, null); assert.ok(row.abandonedAt);
  } finally { await db.close(); }
});

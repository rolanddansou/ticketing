import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { testDatabase } from "./support/database.js";
import { PrismaUserRepository } from "../src/modules/users/prisma-user.repository.js";
let db: Awaited<ReturnType<typeof testDatabase>>;
before(async () => { db = await testDatabase(); });
after(async () => { await db?.close(); });
test("new accounts are invited and public DTO never exposes credentials", async () => {
  const repository = new PrismaUserRepository(db.prisma);
  const user = await repository.create({ name: "Employee", email: "employee@example.com" });
  assert.equal(user.status, "INVITED");
  assert.equal("passwordHash" in user, false);
  assert.equal((await db.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, null);
});

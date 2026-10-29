import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { testDatabase } from "./support/database.js";
import { PrismaUserRepository } from "../src/modules/users/prisma-user.repository.js";
import { PrismaAuthRepository } from "../src/modules/auth/prisma-auth.repository.js";
import { BootstrapService } from "../src/modules/auth/bootstrap.js";
import { Argon2PasswordHasher } from "../src/modules/auth/password.js";
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
test("bootstrap is single-use even concurrently", async () => {
  const service = new BootstrapService(new PrismaAuthRepository(db.prisma), new Argon2PasswordHasher());
  const input = { name: "Admin", email: "admin@example.com", password: "An admin password 123", confirmPassword: "An admin password 123" };
  const results = await Promise.allSettled([service.create(input), service.create({ ...input, email: "other@example.com" })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.prisma.user.count({ where: { role: "SUPER_ADMIN" } }), 1);
  await assert.rejects(service.create(input));
});

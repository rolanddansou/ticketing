import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { testDatabase } from "./support/database.js";
import { PrismaUserRepository } from "../src/modules/users/prisma-user.repository.js";
import { PrismaAuthRepository } from "../src/modules/auth/prisma-auth.repository.js";
import { BootstrapService } from "../src/modules/auth/bootstrap.js";
import { Argon2PasswordHasher } from "../src/modules/auth/password.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { JwtTokens } from "../src/modules/auth/jwt.js";
import express from "express";
import { createAuthRouter } from "../src/routes/auth.js";
import { errorHandler } from "../src/middlewares/error-handler.js";
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

const jwtConfig = { secret: "test-only-secret-".repeat(4), issuer: "test", audience: "api" };
test("login and JWT enforce active users and database sessions", async () => {
  const hasher = new Argon2PasswordHasher();
  const password = "A long login password 123";
  const user = await db.prisma.user.create({ data: { name: "Login", email: "login@example.com", status: "ACTIVE", passwordHash: await hasher.hash(password) } });
  const service = new AuthService(new PrismaAuthRepository(db.prisma), hasher, new JwtTokens(jwtConfig));
  const app = express(); app.use(express.json()); app.use("/auth", createAuthRouter(service)); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/auth`;
  try {
    const response = await fetch(`${url}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal("passwordHash" in body.user, false);
    const headers = { Authorization: `Bearer ${body.accessToken}` };
    assert.equal((await fetch(`${url}/me`, { headers })).status, 200);
    await assert.rejects(service.login(user.email, "wrong"));
    await assert.rejects(service.login("missing@example.com", password));
    await assert.rejects(service.authenticate(body.accessToken + "tampered"));
    await assert.rejects(new JwtTokens({ ...jwtConfig, audience: "wrong" }).verify(body.accessToken));
    await db.prisma.authSession.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
    assert.equal((await fetch(`${url}/me`, { headers })).status, 401);
    await db.prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await assert.rejects(service.login(user.email, password));
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

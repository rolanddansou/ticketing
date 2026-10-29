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
import { AdminService } from "../src/modules/users/admin.service.js";
import { PrismaAdminRepository } from "../src/modules/users/prisma-admin.repository.js";
import { createUsersRouter } from "../src/routes/users.js";
import { InvitationService } from "../src/modules/auth/invitation.service.js";
import { PrismaActionRepository } from "../src/modules/auth/prisma-action.repository.js";
import { EmailEncryption } from "../src/modules/email/encryption.js";
import { FakeEmailProvider } from "../src/modules/email/email-provider.js";
import { PrismaOutboxRepository } from "../src/modules/email/prisma-outbox.repository.js";
import { OutboxWorker } from "../src/modules/email/worker.js";
import { PasswordRecoveryService } from "../src/modules/auth/password-recovery.service.js";
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
    assert.equal("refreshToken" in body, false);
    assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/);
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

test("refresh rotation detects replay and concurrent reuse; logout revokes access", async () => {
  const hasher = new Argon2PasswordHasher();
  const password = "A refresh password 123";
  const user = await db.prisma.user.create({ data: { name: "Refresh", email: "refresh@example.com", status: "ACTIVE", passwordHash: await hasher.hash(password) } });
  const service = new AuthService(new PrismaAuthRepository(db.prisma), hasher, new JwtTokens(jwtConfig));
  const first = await service.login(user.email, password);
  const second = await service.refresh(first.refreshToken);
  assert.notEqual(first.refreshToken, second.refreshToken);
  assert.equal(second.refreshExpiresAt.getTime(), first.refreshExpiresAt.getTime());
  await assert.rejects(service.refresh(first.refreshToken));
  await assert.rejects(service.authenticate(second.accessToken));
  const concurrent = await service.login(user.email, password);
  const results = await Promise.allSettled([service.refresh(concurrent.refreshToken), service.refresh(concurrent.refreshToken)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const success = results.find(result => result.status === "fulfilled");
  assert.ok(success && success.status === "fulfilled");
  await assert.rejects(service.authenticate(success.value.accessToken));
  const session1 = await service.login(user.email, password);
  const session2 = await service.login(user.email, password);
  await service.logout(session1.refreshToken);
  await assert.rejects(service.authenticate(session1.accessToken));
  assert.equal((await service.authenticate(session2.accessToken)).user.id, user.id);
  await service.logoutAll(user.id);
  await assert.rejects(service.authenticate(session2.accessToken));
  const expired = await service.login(user.email, password);
  await db.prisma.authSession.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(service.refresh(expired.refreshToken));
});

test("admin management revokes sessions and preserves the last active admin concurrently", async () => {
  const hasher = new Argon2PasswordHasher();
  const admin = new AdminService(new PrismaAdminRepository(db.prisma), hasher);
  const first = await db.prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
  const password = "A managed password 123";
  const second = await admin.create(first.id, { name: "Second admin", email: "second-admin@example.com", role: "SUPER_ADMIN", password, confirmPassword: password });
  const employee = await admin.create(first.id, { name: "Managed", email: "managed@example.com", password, confirmPassword: password });
  const auth = new AuthService(new PrismaAuthRepository(db.prisma), hasher, new JwtTokens(jwtConfig));
  const login = await auth.login(employee.email, password);
  const changed = await admin.update(first.id, employee.id, { role: "AGENT" });
  assert.equal(changed.role, "AGENT");
  await assert.rejects(auth.authenticate(login.accessToken));
  await assert.rejects(admin.create(first.id, { name: "Duplicate", email: employee.email, password, confirmPassword: password }));
  await admin.setEnabled(first.id, employee.id, false);
  await assert.rejects(auth.login(employee.email, password));
  await admin.setEnabled(first.id, employee.id, true);
  await auth.login(employee.email, password);
  const app = express(); app.use(express.json()); app.use("/users", createUsersRouter(auth, admin, new PrismaUserRepository(db.prisma))); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const token = await auth.login(employee.email, password);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/users`, { headers: { Authorization: `Bearer ${token.accessToken}` } })).status, 403);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  const results = await Promise.allSettled([
    admin.update(first.id, first.id, { role: "EMPLOYEE" }),
    admin.setEnabled(second.id, second.id, false),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.prisma.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } }), 1);
});

test("invitation is transactional, resend invalidates old links, activation is single-use", async () => {
  const admin = await db.prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
  const hasher = new Argon2PasswordHasher();
  const encryption = new EmailEncryption("ab".repeat(32));
  const invitations = new InvitationService(new PrismaActionRepository(db.prisma), hasher, encryption, "https://frontend.example.com");
  await invitations.invite(admin.id, { name: "Invited", email: "invited@example.com" });
  await assert.rejects(invitations.invite(admin.id, { name: "Dup", email: "invited@example.com" }));
  const user = await db.prisma.user.findUniqueOrThrow({ where: { email: "invited@example.com" } });
  const getToken = async () => {
    const mail = await db.prisma.emailOutbox.findFirstOrThrow({ where: { payload: { not: null }, actionToken: { userId: user.id, consumedAt: null } } });
    const link = encryption.decrypt(mail.payload!).text.split(" : ")[1];
    return new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;
  };
  const firstToken = await getToken();
  const password = "An invited password 123";
  await invitations.resend(admin.id, user.id);
  await assert.rejects(invitations.accept({ token: firstToken, password, confirmPassword: password }));
  const token = await getToken();
  const provider = new FakeEmailProvider(); provider.fail = true;
  const worker = new OutboxWorker(new PrismaOutboxRepository(db.prisma), provider, encryption);
  const log = console.error; console.error = () => {};
  try { await worker.tick(); } finally { console.error = log; }
  assert.equal((await db.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status, "INVITED");
  provider.fail = false; await worker.tick(new Date(Date.now() + 61000));
  assert.equal(provider.messages.length, 1);
  const results = await Promise.allSettled([invitations.accept({ token, password, confirmPassword: password }), invitations.accept({ token, password, confirmPassword: password })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await db.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status, "ACTIVE");
  assert.equal(await db.prisma.authSession.count({ where: { userId: user.id } }), 0);
  const auth = new AuthService(new PrismaAuthRepository(db.prisma), hasher, new JwtTokens(jwtConfig));
  await auth.login(user.email, password);
  await assert.rejects(invitations.resend(admin.id, user.id));
  await invitations.invite(admin.id, { name: "Expired", email: "expired-invite@example.com" });
  const expired = await db.prisma.user.findUniqueOrThrow({ where: { email: "expired-invite@example.com" } });
  const mail = await db.prisma.emailOutbox.findFirstOrThrow({ where: { actionToken: { userId: expired.id } } });
  const expiredToken = new URLSearchParams(new URL(encryption.decrypt(mail.payload!).text.split(" : ")[1]).hash.slice(1)).get("token")!;
  await db.prisma.actionToken.updateMany({ where: { userId: expired.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(invitations.accept({ token: expiredToken, password, confirmPassword: password }));
});

test("forgot/reset is generic, single-use, expiring and revokes all sessions", async () => {
  const hasher = new Argon2PasswordHasher(); const encryption = new EmailEncryption("ab".repeat(32));
  const repository = new PrismaActionRepository(db.prisma);
  const recovery = new PasswordRecoveryService(repository, hasher, encryption, "https://frontend.example.com");
  const invitations = new InvitationService(repository, hasher, encryption, "https://frontend.example.com");
  const auth = new AuthService(new PrismaAuthRepository(db.prisma), hasher, new JwtTokens(jwtConfig));
  const password = "Original reset password 123"; const nextPassword = "New reset password 456";
  const user = await db.prisma.user.create({ data: { name: "Reset", email: "reset@example.com", status: "ACTIVE", passwordHash: await hasher.hash(password) } });
  const session = await auth.login(user.email, password);
  const getToken = async () => {
    const mail = await db.prisma.emailOutbox.findFirstOrThrow({ where: { payload: { not: null }, actionToken: { userId: user.id, consumedAt: null } } });
    return new URLSearchParams(new URL(encryption.decrypt(mail.payload!).text.split(" : ")[1]).hash.slice(1)).get("token")!;
  };
  const count = await db.prisma.emailOutbox.count();
  await recovery.forgot({ email: "unknown@example.com" });
  await recovery.forgot({ email: "employee@example.com" });
  assert.equal(await db.prisma.emailOutbox.count(), count);
  await recovery.forgot({ email: user.email }); const old = await getToken();
  await assert.rejects(invitations.accept({ token: old, password: nextPassword, confirmPassword: nextPassword }));
  await recovery.forgot({ email: user.email }); const token = await getToken();
  await assert.rejects(recovery.reset({ token: old, password: nextPassword, confirmPassword: nextPassword }));
  await db.prisma.actionToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { expiresAt: new Date(0) } });
  await assert.rejects(recovery.reset({ token, password: nextPassword, confirmPassword: nextPassword }));
  await recovery.forgot({ email: user.email }); const current = await getToken();
  const results = await Promise.allSettled([recovery.reset({ token: current, password: nextPassword, confirmPassword: nextPassword }), recovery.reset({ token: current, password: nextPassword, confirmPassword: nextPassword })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  await assert.rejects(auth.authenticate(session.accessToken)); await assert.rejects(auth.refresh(session.refreshToken));
  await assert.rejects(auth.login(user.email, password)); await auth.login(user.email, nextPassword);
  const app = express(); app.use(express.json()); app.use("/auth", createAuthRouter(auth, undefined, invitations, recovery)); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const call = (email: string) => fetch(`http://127.0.0.1:${address.port}/auth/forgot-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const existing = await call(user.email), missing = await call("nobody@example.com");
    assert.equal(existing.status, 202); assert.equal(missing.status, 202);
    assert.deepEqual(await existing.json(), await missing.json());
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("authenticated password change checks old password and revokes sessions and links", async () => {
  const hasher = new Argon2PasswordHasher(); const password = "A password to change 123", next = "Changed password value 456";
  const user = await db.prisma.user.create({ data: { name: "Change", email: "change@example.com", status: "ACTIVE", passwordHash: await hasher.hash(password) } });
  const auth = new AuthService(new PrismaAuthRepository(db.prisma), hasher, new JwtTokens(jwtConfig));
  const first = await auth.login(user.email, password), second = await auth.login(user.email, password);
  const identity = await auth.authenticate(first.accessToken);
  await assert.rejects(auth.changePassword(identity, { currentPassword: "wrong", password: next, confirmPassword: next }));
  assert.ok(await auth.authenticate(first.accessToken));
  const recovery = new PasswordRecoveryService(new PrismaActionRepository(db.prisma), hasher, new EmailEncryption("ab".repeat(32)), "https://frontend.example.com");
  await recovery.forgot({ email: user.email });
  await auth.changePassword(identity, { currentPassword: password, password: next, confirmPassword: next });
  await assert.rejects(auth.authenticate(first.accessToken)); await assert.rejects(auth.authenticate(second.accessToken));
  await assert.rejects(auth.refresh(second.refreshToken));
  assert.equal(await db.prisma.actionToken.count({ where: { userId: user.id, consumedAt: null } }), 0);
  await assert.rejects(auth.login(user.email, password)); await auth.login(user.email, next);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { testDatabase } from "./support/database.js";
import { BootstrapService } from "../src/modules/auth/bootstrap.js";
import { PrismaAuthRepository } from "../src/modules/auth/prisma-auth.repository.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { Argon2PasswordHasher } from "../src/modules/auth/password.js";
import { JwtTokens } from "../src/modules/auth/jwt.js";
import { InvitationService } from "../src/modules/auth/invitation.service.js";
import { PasswordRecoveryService } from "../src/modules/auth/password-recovery.service.js";
import { PrismaActionRepository } from "../src/modules/auth/prisma-action.repository.js";
import { AdminService } from "../src/modules/users/admin.service.js";
import { PrismaAdminRepository } from "../src/modules/users/prisma-admin.repository.js";
import { PrismaUserRepository } from "../src/modules/users/prisma-user.repository.js";
import { PrismaTicketRepository } from "../src/modules/tickets/prisma-ticket.repository.js";
import { EmailEncryption } from "../src/modules/email/encryption.js";
import { FakeEmailProvider } from "../src/modules/email/email-provider.js";
import { PrismaOutboxRepository } from "../src/modules/email/prisma-outbox.repository.js";
import { OutboxWorker } from "../src/modules/email/worker.js";
import { createAuthRouter } from "../src/routes/auth.js";
import { createUsersRouter } from "../src/routes/users.js";
import { createTicketsRouter } from "../src/routes/tickets.js";
import { authenticate } from "../src/middlewares/authenticate.js";
import { cors } from "../src/middlewares/browser-security.js";
import { errorHandler } from "../src/middlewares/error-handler.js";

test("complete browser auth flow and ticket permission matrix", async () => {
  const db = await testDatabase();
  const hasher = new Argon2PasswordHasher(), repository = new PrismaAuthRepository(db.prisma);
  const auth = new AuthService(repository, hasher, new JwtTokens({ secret: "test-only-".repeat(5), issuer: "test", audience: "test" }));
  const encryption = new EmailEncryption("ab".repeat(32)), provider = new FakeEmailProvider();
  const frontend = "https://frontend.example.com", browser = { origin: frontend, secure: true };
  const invitations = new InvitationService(new PrismaActionRepository(db.prisma), hasher, encryption, frontend);
  const recovery = new PasswordRecoveryService(new PrismaActionRepository(db.prisma), hasher, encryption, frontend);
  const admin = new AdminService(new PrismaAdminRepository(db.prisma), hasher);
  const worker = new OutboxWorker(new PrismaOutboxRepository(db.prisma), provider, encryption);
  const app = express(); app.use(cors(browser)); app.use(express.json());
  app.use("/auth", createAuthRouter(auth, browser, invitations, recovery));
  app.use("/users", createUsersRouter(auth, admin, new PrismaUserRepository(db.prisma), invitations));
  app.use("/tickets", createTicketsRouter(new PrismaTicketRepository(db.prisma), authenticate(auth))); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const call = (path: string, method = "GET", body?: unknown, token?: string, extra: Record<string, string> = {}) => fetch(url + path, {
    method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const password = "A browser flow password 123";
  const login = async (email: string, pwd = password) => {
    const response = await call("/auth/login", "POST", { email, password: pwd }); assert.equal(response.status, 200);
    return { body: await response.json(), cookie: response.headers.get("set-cookie")!.split(";")[0] };
  };
  const mailToken = (index: number) => new URLSearchParams(new URL(provider.messages[index].text.split(" : ")[1]).hash.slice(1)).get("token");
  try {
    await new BootstrapService(repository, hasher).create({ name: "Admin", email: "admin@flow.com", password, confirmPassword: password });
    const root = await login("admin@flow.com");
    assert.equal((await call("/users?role=SUPER_ADMIN&status=ACTIVE", "GET", undefined, root.body.accessToken)).status, 200);
    assert.equal((await call(`/users/${root.body.user.id}`, "GET", undefined, root.body.accessToken)).status, 200);
    assert.equal((await call("/tickets")).status, 401);
    assert.equal((await call("/users/invitations", "POST", { name: "Employee", email: "employee@flow.com" }, root.body.accessToken)).status, 202);
    await worker.tick(); assert.equal(provider.messages.length, 1);
    assert.equal((await call("/auth/accept-invitation", "POST", { token: mailToken(0), password, confirmPassword: password })).status, 204);
    const employee = await login("employee@flow.com");
    assert.match(employee.cookie, /^refresh_token=/);
    assert.equal((await call("/auth/refresh", "POST", {}, undefined, { Cookie: employee.cookie })).status, 403);
    const refreshed = await call("/auth/refresh", "POST", {}, undefined, { Cookie: employee.cookie, Origin: frontend, "X-CSRF-Protection": "1" });
    assert.equal(refreshed.status, 200); assert.match(refreshed.headers.get("set-cookie")!, /Secure/);
    const employeeToken = (await refreshed.json()).accessToken;
    let response = await call("/tickets", "POST", { title: "My ticket" }, employeeToken);
    assert.equal(response.status, 201); const own = await response.json();
    assert.equal(own.createdById, employee.body.user.id);
    const other = await (await call("/tickets", "POST", { title: "Other ticket" }, root.body.accessToken)).json();
    const legacy = await db.prisma.ticket.create({ data: { title: "Legacy" } });
    assert.equal((await call(`/tickets/${own.id}`, "GET", undefined, employeeToken)).status, 200);
    assert.equal((await call(`/tickets/${other.id}`, "GET", undefined, employeeToken)).status, 404);
    assert.equal((await call(`/tickets/${legacy.id}`, "GET", undefined, employeeToken)).status, 404);
    assert.equal((await (await call("/tickets", "GET", undefined, employeeToken)).json()).total, 1);
    assert.equal((await (await call(`/tickets?createdById=${root.body.user.id}`, "GET", undefined, employeeToken)).json()).total, 0);
    assert.equal((await call(`/tickets/${own.id}`, "PATCH", { title: "Change" }, employeeToken)).status, 403);
    for (const body of [{ title: "Bad", createdById: null }, { title: "Bad", status: "CLOSED" }, { title: "Bad", assignedToId: null }, { title: "Bad", resolveById: null }]) {
      assert.equal((await call("/tickets", "POST", body, employeeToken)).status, 400);
    }
    for (const role of ["AGENT", "ADMIN"] as const) {
      const email = `role-${role.toLowerCase()}@flow.com`;
      response = await call("/users", "POST", { name: role, email, role, password, confirmPassword: password }, root.body.accessToken);
      assert.equal(response.status, 201); assert.equal("passwordHash" in await response.json(), false);
      const actor = await login(email);
      assert.equal((await call("/users", "GET", undefined, actor.body.accessToken)).status, role === "ADMIN" ? 200 : 403);
      assert.equal((await call(`/tickets/${legacy.id}`, "GET", undefined, actor.body.accessToken)).status, 200);
      assert.ok((await (await call("/tickets", "GET", undefined, actor.body.accessToken)).json()).total >= 3);
      assert.equal((await call("/tickets", "POST", { title: role }, actor.body.accessToken)).status, 201);
      assert.equal((await call(`/tickets/${other.id}`, "PATCH", { title: "Updated" }, actor.body.accessToken)).status, 200);
      if (role === "ADMIN") {
        assert.equal((await call("/users", "POST", { name: "Escalation", email: "escalation@flow.com", role: "SUPER_ADMIN", password, confirmPassword: password }, actor.body.accessToken)).status, 403);
        assert.equal((await call("/users/invitations", "POST", { name: "Escalation", email: "escalation@flow.com", role: "ADMIN" }, actor.body.accessToken)).status, 403);
        assert.equal((await call(`/users/${root.body.user.id}`, "PATCH", { name: "Forbidden" }, actor.body.accessToken)).status, 403);
        assert.equal((await call(`/users/${root.body.user.id}`, "GET", undefined, actor.body.accessToken)).status, 404);
        assert.equal((await call(`/users/${employee.body.user.id}`, "PATCH", { role: "ADMIN" }, actor.body.accessToken)).status, 403);
        const managed = await call("/users", "POST", { name: "Managed user", email: "managed@flow.com", role: "USER", password, confirmPassword: password }, actor.body.accessToken);
        assert.equal(managed.status, 201);
        const managedUser = await managed.json();
        assert.equal((await call(`/users/${managedUser.id}/disable`, "POST", {}, actor.body.accessToken)).status, 200);
        assert.equal((await call(`/users/${managedUser.id}/enable`, "POST", {}, actor.body.accessToken)).status, 200);
        const listed = await (await call("/users", "GET", undefined, actor.body.accessToken)).json();
        assert.ok(listed.items.every((user: { role: string }) => ["USER", "AGENT"].includes(user.role)));
      }
    }
    assert.equal((await call("/auth/forgot-password", "POST", { email: "employee@flow.com" })).status, 202);
    await worker.tick(); assert.equal(provider.messages.length, 2);
    const next = "New browser password 456";
    assert.equal((await call("/auth/reset-password", "POST", { token: mailToken(1), password: next, confirmPassword: next })).status, 204);
    assert.equal((await call("/auth/me", "GET", undefined, employeeToken)).status, 401);
    await login("employee@flow.com", next);
    const current = await login("role-agent@flow.com");
    const changed = "Changed browser password 789";
    response = await call("/auth/change-password", "POST", { currentPassword: password, password: changed, confirmPassword: changed }, current.body.accessToken);
    assert.equal(response.status, 204); assert.match(response.headers.get("set-cookie")!, /Expires=Thu, 01 Jan 1970/);
    const again = await login("role-agent@flow.com", changed);
    assert.equal((await call("/auth/logout", "POST", {}, undefined, { Cookie: again.cookie, Origin: frontend, "X-CSRF-Protection": "1" })).status, 204);
    assert.equal((await call("/auth/me", "GET", undefined, again.body.accessToken)).status, 401);
    // Exhaustion remains a generic 429 and never invokes an email provider inline.
    let limited: Response | undefined;
    for (let attempt = 0; attempt < 5; attempt++) limited = await call("/auth/forgot-password", "POST", { email: "unknown@flow.com" });
    assert.equal(limited!.status, 429);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.close();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { globalRateLimit, healthRateLimit, invitationRateLimit, loginAccountRateLimit, ticketCreationRateLimit } from "../src/middlewares/rate-limit.js";

test("global limit returns JSON and exempts health and OPTIONS", async () => {
  const app = express();
  app.use(globalRateLimit());
  app.use((_req, res) => { res.sendStatus(204); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (let i = 0; i < 300; i++) assert.equal((await fetch(`${base}/tickets`)).status, 204);
    const blocked = await fetch(`${base}/tickets`);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("Retry-After")) > 0);
    assert.equal((await blocked.json()).error.code, "RATE_LIMITED");
    assert.equal((await fetch(`${base}/health`)).status, 204);
    assert.equal((await fetch(`${base}/tickets`, { method: "OPTIONS" })).status, 204);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("inviting and resending share the account quota", async () => {
  const app = express();
  const limit = invitationRateLimit();
  app.use((req, res, next) => {
    Object.assign(res.locals, { identity: { user: { id: req.get("X-Test-Account") } } });
    next();
  });
  app.post(["/invitations", "/:id/resend-invitation"], limit, (_req, res) => { res.sendStatus(202); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const post = (path: string, id: string) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST", headers: { "X-Test-Account": id },
    });
    for (let i = 0; i < 30; i++) assert.equal((await post("/invitations", "admin-one")).status, 202);
    assert.equal((await post("/user/resend-invitation", "admin-one")).status, 429);
    assert.equal((await post("/user/resend-invitation", "admin-two")).status, 202);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("ticket creation quota is per account", async () => {
  const app = express();
  app.use((req, res, next) => { Object.assign(res.locals, { identity: { user: { id: req.get("X-Test-Account") } } }); next(); });
  app.post("/", ticketCreationRateLimit(), (_req, res) => { res.sendStatus(201); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const post = (account: string) => fetch(`http://127.0.0.1:${address.port}/`, { method: "POST", headers: { "X-Test-Account": account } });
    for (let i = 0; i < 30; i++) assert.equal((await post("a")).status, 201);
    assert.equal((await post("a")).status, 429);
    assert.equal((await post("b")).status, 201);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

// VULN-006.1 regression: /health is no longer fully unbounded, only exempt from the stricter
// globalRateLimit; it still gets its own, more generous but finite cap.
test("health has its own bounded limit instead of being exempt from everything", async () => {
  const app = express();
  app.get("/health", healthRateLimit(), (_req, res) => { res.sendStatus(200); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (let i = 0; i < 120; i++) assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/health`)).status, 429);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

// VULN-006.3 regression: in addition to the per-IP limit, each targeted account also has its own
// cap, so spreading guesses across many source IPs against one account no longer bypasses throttling.
test("login quota is also capped per targeted account", async () => {
  const app = express();
  app.use(express.json());
  app.post("/login", loginAccountRateLimit(), (_req, res) => { res.sendStatus(401); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const post = (email: string) => fetch(`http://127.0.0.1:${address.port}/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "x" }),
    });
    for (let i = 0; i < 10; i++) assert.equal((await post("Victim@Example.com")).status, 401);
    assert.equal((await post("victim@example.com")).status, 429); // case-insensitive, same account
    assert.equal((await post("other@example.com")).status, 401); // different account, unaffected
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

// Regression: a missing/malformed email must not fall back to one single shared bucket (every
// client's malformed requests would otherwise rate-limit every other client's). It falls back to
// the requester's own IP instead, so two different sources stay isolated from each other.
test("login quota falls back to the requester's IP, not a single shared bucket, for a malformed email", async () => {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.post("/login", loginAccountRateLimit(), (_req, res) => { res.sendStatus(401); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const post = (forwardedFor: string, body: unknown) => fetch(`http://127.0.0.1:${address.port}/login`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": forwardedFor }, body: JSON.stringify(body),
    });
    for (let i = 0; i < 10; i++) assert.equal((await post("203.0.113.1", { password: "x" })).status, 401); // no email field
    assert.equal((await post("203.0.113.1", {})).status, 429); // same source, quota exhausted
    assert.equal((await post("203.0.113.2", { email: 42 })).status, 401); // different source, unaffected
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

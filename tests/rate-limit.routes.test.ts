import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { globalRateLimit, invitationRateLimit } from "../src/middlewares/rate-limit.js";

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

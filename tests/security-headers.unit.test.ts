import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { securityHeaders } from "../src/middlewares/browser-security.js";

async function request(production: boolean) {
  const app = express();
  app.use(securityHeaders(production));
  app.get("/", (_req, res) => { res.sendStatus(204); });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return await fetch(`http://127.0.0.1:${address.port}/`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test("security headers are set on every response", async () => {
  const response = await request(false);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("strict-transport-security"), null);
});

test("HSTS is only set in production", async () => {
  const response = await request(true);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
});

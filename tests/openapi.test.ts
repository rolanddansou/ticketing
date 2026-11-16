import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";
import express from "express";
import { createDocsRouter } from "../src/routes/docs.js";

test("OpenAPI 3.1 describes the routes registered by the API", async () => {
  const document = await SwaggerParser.validate("openapi.json");
  assert.equal("openapi" in document && document.openapi, "3.1.0");
  const expected = [];
  for (const resource of ["auth", "users", "tickets", "health"]) {
    const source = readFileSync(`src/routes/${resource}.ts`, "utf8");
    const prefix = resource === "health" ? "" : `/${resource}`;
    for (const [, method, route] of source.matchAll(/\b(?:router|healthRouter)\.(get|post|patch)\("([^"]+)"/g)) {
      const path = (prefix + route).replace(/:([a-zA-Z]+)/g, "{$1}").replace(/\/$/, "");
      expected.push(`${method} ${path}`);
    }
  }
  const operations = Object.entries(document.paths!).flatMap(([path, item]) =>
    Object.keys(item ?? {}).filter(method => ["get", "post", "patch"].includes(method)).map(method => `${method} ${path}`));
  assert.deepEqual(operations.sort(), expected.sort());
});

for (const production of [false, true]) {
  test(`documentation is served with the expected Swagger settings (production=${production})`, async () => {
    const app = express();
    app.use(createDocsRouter(production));
    const server = app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const base = `http://127.0.0.1:${address.port}`;
      const spec = await fetch(`${base}/openapi.json`);
      assert.equal(spec.status, 200);
      assert.equal((await spec.json()).openapi, "3.1.0");
      const docs = await fetch(`${base}/docs/`);
      assert.equal(docs.status, 200);
      assert.match(await docs.text(), /Swagger UI/);
      const setup = await (await fetch(`${base}/docs/swagger-ui-init.js`)).text();
      assert.match(setup, production ? /"supportedSubmitMethods":\s*\[\s*\]/ : /"supportedSubmitMethods":\s*\[\s*"get"/);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}

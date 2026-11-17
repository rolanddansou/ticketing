import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

// VULN-004 regression: NODE_ENV must have no default. A deployment that forgets to set it
// must refuse to start instead of silently falling back to development behaviour.
function loadEnv(nodeEnv: string | undefined): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, ["--import", "tsx", "-e", "import('./src/config/env.ts')"], {
      env: { ...process.env, NODE_ENV: nodeEnv, DATABASE_URL: "postgresql://user:pass@localhost:5432/db" },
      stdio: "pipe",
    });
    return { status: 0, stderr: "" };
  } catch (error) {
    const { status, stderr } = error as { status: number; stderr: Buffer };
    return { status: status ?? 1, stderr: stderr.toString() };
  }
}

test("startup refuses a missing or invalid NODE_ENV", () => {
  for (const nodeEnv of [undefined, "", "staging"]) {
    const { status, stderr } = loadEnv(nodeEnv);
    assert.notEqual(status, 0);
    assert.match(stderr, /NODE_ENV/);
  }
});

test("startup accepts an explicit NODE_ENV", () => {
  for (const nodeEnv of ["development", "test", "production"]) {
    const { status } = loadEnv(nodeEnv);
    assert.equal(status, 0);
  }
});

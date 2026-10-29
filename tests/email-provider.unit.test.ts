import assert from "node:assert/strict";
import { test } from "node:test";
import { ResendEmailProvider } from "../src/modules/email/resend-email-provider.js";
import { parseEmailConfig } from "../src/modules/email/email-config.js";
import { ResendDeliveryError } from "../src/modules/email/email-delivery-error.js";
import { OutboxWorker } from "../src/modules/email/worker.js";
import { EmailEncryption } from "../src/modules/email/encryption.js";
import type { OutboxRepository } from "../src/modules/email/outbox.repository.js";

test("provider config requires only the chosen provider and keeps SMTP compatibility", () => {
  const common = { OUTBOX_ENCRYPTION_KEY: "ab".repeat(32) };
  assert.equal(parseEmailConfig({ ...common, EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", RESEND_FROM: "sender@example.com" }).EMAIL_PROVIDER, "resend");
  assert.equal(parseEmailConfig({ ...common, SMTP_HOST: "localhost", SMTP_FROM: "sender@example.com" }).EMAIL_PROVIDER, "smtp");
  assert.throws(() => parseEmailConfig({ ...common, EMAIL_PROVIDER: "resend", RESEND_FROM: "sender@example.com" }));
  assert.throws(() => parseEmailConfig({ ...common, EMAIL_PROVIDER: "unknown" }));
  assert.throws(() => parseEmailConfig({ ...common, EMAIL_PROVIDER: "resend", RESEND_API_KEY: "replace_with_key", RESEND_FROM: "sender@example.com" }));
});

test("Resend sends the expected request and preserves the idempotency key", async () => {
  const requests: RequestInit[] = [];
  const request: typeof fetch = async (input, init) => {
    assert.equal(input, "https://api.resend.com/emails"); requests.push(init!);
    return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
  };
  const provider = new ResendEmailProvider("test-api-key", "sender@example.com", request);
  const message = { to: "recipient@example.com", subject: "Invitation", text: "Text", html: "<p>Text</p>" };
  await provider.send(message, { idempotencyKey: "outbox-id" });
  await provider.send(message, { idempotencyKey: "outbox-id" });
  for (const init of requests) {
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-api-key");
    assert.equal(new Headers(init.headers).get("Idempotency-Key"), "outbox-id");
    assert.deepEqual(JSON.parse(init.body as string), { from: "sender@example.com", to: [message.to], subject: message.subject, text: message.text, html: message.html });
    assert.ok(init.signal);
  }
});
test("Resend errors do not expose the provider response", async () => {
  const message = { to: "recipient@example.com", subject: "Test", text: "Test", html: "Test" };
  for (const status of [401, 429, 503]) {
    const request: typeof fetch = async () => new Response("sensitive provider response", { status });
    await assert.rejects(new ResendEmailProvider("secret", "sender@example.com", request).send(message), error => {
      assert.ok(error instanceof ResendDeliveryError);
      assert.equal(error.httpStatus, status);
      assert.equal(error.provider, "resend");
      assert.equal(error.message, "Resend email delivery failed");
      assert.doesNotMatch(JSON.stringify(error), /sensitive provider response|secret/);
      return true;
    });
  }
  const invalid: typeof fetch = async () => new Response("{}", { status: 200 });
  await assert.rejects(new ResendEmailProvider("secret", "sender@example.com", invalid).send(message), { message: "Invalid Resend delivery response" });
});

test("outbox logs the Resend status without secrets and preserves retries", async () => {
  const encryption = new EmailEncryption("ab".repeat(32));
  const now = new Date();
  const message = { to: "private@example.com", subject: "Private subject", text: "secret-token", html: "secret-token" };
  for (const status of [401, 429, 503]) {
    let retryAt: Date | undefined;
    const repository: OutboxRepository = {
      async claim() { return { id: "outbox-id", attempts: 1, payload: encryption.encrypt(message), actionTokenId: null,
        expiresAt: new Date(now.getTime() + 3600000), lockToken: "lease" }; },
      async isValid() { return true; },
      async finish() { assert.fail("First failure must remain retryable"); },
      async retry(_item, availableAt) { retryAt = availableAt; },
    };
    const request: typeof fetch = async () => new Response("sensitive provider response", { status });
    const worker = new OutboxWorker(repository, new ResendEmailProvider("private-api-key", "sender@example.com", request), encryption);
    const logs: unknown[][] = [], original = console.error;
    console.error = (...args) => { logs.push(args); };
    try { await worker.tick(now); } finally { console.error = original; }
    assert.deepEqual(logs, [["Email delivery failed", { outboxId: "outbox-id", attempt: 1, provider: "resend", httpStatus: status }]]);
    assert.doesNotMatch(JSON.stringify(logs), /private-api-key|private@example.com|Private subject|secret-token|sensitive provider response/);
    assert.equal(retryAt?.getTime(), now.getTime() + 60000);
  }
});

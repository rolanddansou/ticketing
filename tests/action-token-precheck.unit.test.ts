import assert from "node:assert/strict";
import { test } from "node:test";
import { InvitationService } from "../src/modules/auth/invitation.service.js";
import { PasswordRecoveryService } from "../src/modules/auth/password-recovery.service.js";
import type { InvitationRepository, PasswordRecoveryRepository } from "../src/modules/auth/action.repository.js";
import type { PasswordHasher } from "../src/modules/auth/password.js";

const token = "A".repeat(43);
const password = "un-mot-de-passe-assez-long-123";
const confirmPassword = password;

function fakeHasher(onHash: () => void): PasswordHasher {
  return {
    async hash(value) { onHash(); return `hashed:${value}`; },
    async verify() { return true; },
  };
}

// VULN-006.2 regression: an invalid token must be rejected before the costly Argon2 hash runs.
test("invitation acceptance skips Argon2 when the token is invalid", async () => {
  let hashCalls = 0;
  const repository: InvitationRepository = {
    async invite() {},
    async resend() {},
    async isInvitationTokenValid() { return false; },
    async acceptInvitation() { throw new Error("should not be called"); },
  };
  const service = new InvitationService(repository, fakeHasher(() => hashCalls++), {} as never, "https://app.example.com");
  await assert.rejects(service.accept({ token, password, confirmPassword }), /invalide ou expiré/);
  assert.equal(hashCalls, 0);
});

test("invitation acceptance hashes and consumes when the token is valid", async () => {
  let hashCalls = 0;
  let acceptedWith: { hash: string; passwordHash: string } | undefined;
  const repository: InvitationRepository = {
    async invite() {},
    async resend() {},
    async isInvitationTokenValid() { return true; },
    async acceptInvitation(hash, passwordHash) { acceptedWith = { hash, passwordHash }; },
  };
  const service = new InvitationService(repository, fakeHasher(() => hashCalls++), {} as never, "https://app.example.com");
  await service.accept({ token, password, confirmPassword });
  assert.equal(hashCalls, 1);
  assert.ok(acceptedWith?.passwordHash.startsWith("hashed:"));
});

test("password reset skips Argon2 when the token is invalid", async () => {
  let hashCalls = 0;
  const repository: PasswordRecoveryRepository = {
    async requestReset() {},
    async isResetTokenValid() { return false; },
    async resetPassword() { throw new Error("should not be called"); },
  };
  const service = new PasswordRecoveryService(repository, fakeHasher(() => hashCalls++), {} as never, "https://app.example.com");
  await assert.rejects(service.reset({ token, password, confirmPassword }), /invalide ou expiré/);
  assert.equal(hashCalls, 0);
});

test("password reset hashes and consumes when the token is valid", async () => {
  let hashCalls = 0;
  const repository: PasswordRecoveryRepository = {
    async requestReset() {},
    async isResetTokenValid() { return true; },
    async resetPassword() {},
  };
  const service = new PasswordRecoveryService(repository, fakeHasher(() => hashCalls++), {} as never, "https://app.example.com");
  await service.reset({ token, password, confirmPassword });
  assert.equal(hashCalls, 1);
});

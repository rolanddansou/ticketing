import assert from "node:assert/strict";
import { test } from "node:test";
import { Argon2PasswordHasher } from "../src/modules/auth/password.js";
import { passwordPairSchema } from "../src/modules/auth/auth.dto.js";
import { JwtTokens } from "../src/modules/auth/jwt.js";
import { SignJWT } from "jose";

test("password pair validation preserves spaces and rejects invalid confirmations", async () => {
  const password = "  a long password with spaces  ";
  assert.equal(passwordPairSchema.parse({ password, confirmPassword: password }).password, password);
  for (const input of [{ password: "short", confirmPassword: "short" }, { password, confirmPassword: "different" }, { password: "a".repeat(129), confirmPassword: "a".repeat(129) }]) {
    assert.equal(passwordPairSchema.safeParse(input).success, false);
  }
  const hasher = new Argon2PasswordHasher();
  const hash = await hasher.hash(password);
  assert.match(hash, /^\$argon2id\$/);
  assert.notEqual(hash, password);
  assert.equal(await hasher.verify(hash, password), true);
  assert.equal(await hasher.verify(hash, password.trim()), false);
});

test("JWT rejects expiry, wrong signature, issuer, audience and algorithm", async () => {
  const config = { secret: "test-only-secret".repeat(4), issuer: "test", audience: "api" };
  const tokens = new JwtTokens(config);
  const id = "00000000-0000-4000-8000-000000000001";
  const signed = await tokens.sign(id, id);
  assert.deepEqual(await tokens.verify(signed), { userId: id, sessionId: id });
  for (const overrides of [{ secret: "different-secret".repeat(4) }, { issuer: "other" }, { audience: "other" }]) {
    await assert.rejects(new JwtTokens({ ...config, ...overrides }).verify(signed));
  }
  const key = new TextEncoder().encode(config.secret);
  const expired = await new SignJWT({ sid: id }).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuer(config.issuer).setAudience(config.audience).setIssuedAt(1).setExpirationTime(2).sign(key);
  await assert.rejects(tokens.verify(expired));
  const wrongAlgorithm = await new SignJWT({ sid: id }).setProtectedHeader({ alg: "HS384" }).setSubject(id).setIssuer(config.issuer).setAudience(config.audience).setIssuedAt().setExpirationTime("15m").sign(key);
  await assert.rejects(tokens.verify(wrongAlgorithm));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Argon2PasswordHasher } from "../src/modules/auth/password.js";
import { passwordPairSchema } from "../src/modules/auth/auth.dto.js";

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

import assert from "node:assert/strict";
import { test } from "node:test";
import { createUserSchema, updateUserSchema, listUsersSchema } from "../src/modules/users/user.dto.js";

test("user creation trims, normalizes email and defaults role", () => {
  assert.deepEqual(createUserSchema.parse({ name: " Alice ", email: " Alice@EXAMPLE.com " }), {
    name: "Alice", email: "alice@example.com", role: "USER",
  });
  for (const role of ["SUPER_ADMIN", "ADMIN", "AGENT", "USER"]) {
    assert.equal(createUserSchema.parse({ name: "A", email: "a@example.com", role }).role, role);
  }
});

test("user rejects invalid values and unknown or protected fields", () => {
  const base = { name: "Alice", email: "alice@example.com" };
  for (const fields of [{ name: " " }, { name: "a".repeat(201) }, { email: "invalid" }, { email: `${"a".repeat(250)}@example.com` }, { role: "INVALID" }, { id: "x" }, { createdAt: "x" }, { unknown: 1 }]) {
    assert.equal(createUserSchema.safeParse({ ...base, ...fields }).success, false);
  }
});

test("user partial updates require a defined value", () => {
  assert.deepEqual(updateUserSchema.parse({ email: " NEW@Example.com " }), { email: "new@example.com" });
  for (const input of [{}, { name: undefined }, { name: null }, { role: "INVALID" }, { id: "x" }]) {
    assert.equal(updateUserSchema.safeParse(input).success, false);
  }
});

test("user listing validates pagination and role", () => {
  assert.deepEqual(listUsersSchema.parse({}), { page: 1, limit: 20 });
  assert.deepEqual(listUsersSchema.parse({ page: "2", limit: "100", role: "AGENT" }), { page: 2, limit: 100, role: "AGENT" });
  for (const input of [{ page: 0 }, { page: "" }, { page: true }, { page: "1.5" }, { limit: 101 }, { role: "INVALID" }, { unknown: 1 }, { page: Number.MAX_SAFE_INTEGER, limit: 100 }]) {
    assert.equal(listUsersSchema.safeParse(input).success, false);
  }
});

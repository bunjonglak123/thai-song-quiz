import { test } from "node:test";
import assert from "node:assert/strict";
import { initialOf } from "../src/lib/identity.ts";

test("initialOf keeps Thai marks and handles leading vowels", () => {
  assert.equal(initialOf("ภานุ"), "ภ");
  assert.equal(initialOf("มิ้นท์"), "มิ้"); // tone mark stays with its consonant
  assert.equal(initialOf("เบิร์ด"), "เบิ");
  assert.equal(initialOf("ไผ่"), "ไผ่");
  assert.equal(initialOf("panupong"), "P");
  assert.equal(initialOf("  "), "?");
});

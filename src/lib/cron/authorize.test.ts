import assert from "node:assert/strict";
import test from "node:test";

import { bearerMatches } from "./authorize";

test("bearerMatches accepts the exact Bearer secret", () => {
  assert.equal(bearerMatches("Bearer super-secret", "super-secret"), true);
});

test("bearerMatches rejects a missing, wrong, or unprefixed value", () => {
  assert.equal(bearerMatches("", "super-secret"), false);
  assert.equal(bearerMatches("Bearer nope", "super-secret"), false);
  assert.equal(bearerMatches("super-secret", "super-secret"), false);
});

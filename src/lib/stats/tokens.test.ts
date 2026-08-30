import assert from "node:assert/strict";
import test from "node:test";

import { estimateTokens } from "./tokens";

test("empty text is zero tokens", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
});

test("encodes ordinary words", () => {
  assert.equal(estimateTokens("hello"), 1);
  assert.equal(estimateTokens("Hello, world!"), 4);
});

test("batches code whitespace instead of counting every character", () => {
  const codeText = "    const total = await opus5.generate();    ";
  assert.equal(estimateTokens(codeText), 10);
  assert.ok(estimateTokens(codeText) <= Math.floor(codeText.length / 4));
});

import assert from "node:assert/strict";
import test from "node:test";

import { stripMarkdown } from "./strip-markdown";

test("stripMarkdown drops emphasis, headings, lists, and links", () => {
  const plain = stripMarkdown(
    [
      "## Overnight",
      "",
      "Shipped **login** and *passkeys*.",
      "- [Docs](https://example.com) updated",
      "1. `pk_` keys rotated",
      "> leftover quote",
    ].join("\n"),
  );

  assert.equal(
    plain,
    "Overnight: Shipped login and passkeys. Docs updated pk_ keys rotated leftover quote",
  );
});

test("stripMarkdown does not double an existing heading colon", () => {
  assert.equal(stripMarkdown("### Status:"), "Status:");
});

test("stripMarkdown keeps identifiers that use underscores", () => {
  assert.equal(
    stripMarkdown("See **CASA_READINESS_PLAN.md**"),
    "See CASA_READINESS_PLAN.md",
  );
});

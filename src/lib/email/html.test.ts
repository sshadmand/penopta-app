import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml, summaryMarkdownToEmailHtml } from "./html";

test("escapeHtml encodes markup characters", () => {
  assert.equal(escapeHtml(`<a href="x">a&b</a>`), "&lt;a href=&quot;x&quot;&gt;a&amp;b&lt;/a&gt;");
});

test("summaryMarkdownToEmailHtml renders headings, bullets, and bold", () => {
  const html = summaryMarkdownToEmailHtml(
    ["Shipped **login**.", "", "## Auth", "- Passkeys", "- Google sign-in"].join(
      "\n",
    ),
  );

  assert.match(html, /<p style="[^"]*">Shipped <strong>login<\/strong>\.<\/p>/);
  assert.match(html, /<h3 style="[^"]*">Auth<\/h3>/);
  assert.match(html, /<li style="[^"]*">Passkeys<\/li>/);
  assert.match(html, /<li style="[^"]*">Google sign-in<\/li>/);
});

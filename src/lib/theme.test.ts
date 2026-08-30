import assert from "node:assert/strict";
import test from "node:test";

import { parseThemePreference, resolveTheme } from "./theme";

test("parseThemePreference accepts stored values and falls back to dark", () => {
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("system"), "system");
  assert.equal(parseThemePreference(null), "dark");
  assert.equal(parseThemePreference("nope"), "dark");
});

test("resolveTheme follows the system when asked", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("resolveTheme honors an explicit choice over the system", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

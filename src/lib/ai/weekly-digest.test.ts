import assert from "node:assert/strict";
import test from "node:test";

import { utcIsoWeekKey } from "./iso-week";

test("utcIsoWeekKey uses Thursday to pick the ISO year", () => {
  assert.equal(utcIsoWeekKey(new Date("2021-01-01T12:00:00Z")), "2020-W53");
  assert.equal(utcIsoWeekKey(new Date("2026-08-24T14:00:00Z")), "2026-W35");
  assert.equal(utcIsoWeekKey(new Date("2026-12-31T12:00:00Z")), "2026-W53");
});

test("utcIsoWeekKey treats Monday 00:00 UTC as the start of the week", () => {
  assert.equal(utcIsoWeekKey(new Date("2026-08-23T23:00:00Z")), "2026-W34");
  assert.equal(utcIsoWeekKey(new Date("2026-08-24T00:00:00Z")), "2026-W35");
});

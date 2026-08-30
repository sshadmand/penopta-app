import assert from "node:assert/strict";
import test from "node:test";

import type { SourceActivityItem } from "@/lib/db/schema";
import { shouldWriteThreadSnapshot, sourceActivityEqual } from "./snapshots";

const turn: SourceActivityItem = {
  timestamp: "2026-08-14T10:00:00.000Z",
  role: "user",
  text: "hello",
  isExact: true,
};

test("sourceActivityEqual treats missing as empty", () => {
  assert.equal(sourceActivityEqual(undefined, []), true);
  assert.equal(sourceActivityEqual([turn], [turn]), true);
  assert.equal(
    sourceActivityEqual([turn], [{ ...turn, text: "other" }]),
    false,
  );
});

test("shouldWriteThreadSnapshot always writes the first copy", () => {
  assert.equal(shouldWriteThreadSnapshot(undefined, []), true);
  assert.equal(shouldWriteThreadSnapshot(undefined, [turn]), true);
  assert.equal(shouldWriteThreadSnapshot([turn], [turn]), false);
  assert.equal(shouldWriteThreadSnapshot([], [turn]), true);
});

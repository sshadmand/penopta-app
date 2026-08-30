import assert from "node:assert/strict";
import test from "node:test";

import {
  attributeThreadPlans,
  extractPlanFiles,
  isInheritPrompt,
  isOperationalFollowUp,
  isShortHold,
  planKey,
} from "./plan-spans";

test("extracts plan filenames and skips process docs", () => {
  const files = extractPlanFiles(
    "See CASA_READINESS_PLAN.md then PLANNING.md and docs/PLAN_AND_REVIEW.md",
  );
  assert.deepEqual(files, ["CASA_READINESS_PLAN.md"]);
});

test("merges hyphen and underscore plan keys", () => {
  assert.equal(planKey("casa-t2-features-plan.md"), "CASA_T2_FEATURES_PLAN");
  assert.equal(planKey("CASA_T2_FEATURES_PLAN.md"), "CASA_T2_FEATURES_PLAN");
});

test("inherits short continue, drops a new unlabeled ask", () => {
  const attributed = attributeThreadPlans([
    {
      role: "user",
      text: "Work from docs/plans/LINUX_SYNC_PLAN.md",
      timestamp: "2026-08-13T10:00:00Z",
    },
    { role: "assistant", text: "Starting.", timestamp: "2026-08-13T10:01:00Z" },
    { role: "user", text: "what's next?", timestamp: "2026-08-13T10:02:00Z" },
    { role: "assistant", text: "Deploy.", timestamp: "2026-08-13T10:03:00Z" },
    {
      role: "user",
      text: "Let's turn this into CASA_T2_FEATURES_PLAN.md",
      timestamp: "2026-08-13T10:04:00Z",
    },
    {
      role: "user",
      text: "Forget that — how does billing work on the marketing site?",
      timestamp: "2026-08-13T10:05:00Z",
    },
  ]);

  assert.equal(attributed[0]?.key, "LINUX_SYNC_PLAN");
  assert.equal(attributed[0]?.source, "named");
  assert.equal(attributed[2]?.source, "inherited");
  assert.equal(attributed[4]?.key, "CASA_T2_FEATURES_PLAN");
  assert.equal(attributed[5], null);
});

test("agent final reply can resolve an unlabeled human ask to one plan file", () => {
  const attributed = attributeThreadPlans([
    {
      role: "user",
      text: "Work on the casa plan",
      timestamp: "2026-08-14T10:00:00Z",
    },
    {
      role: "assistant",
      text: "I'll start from docs/plans/CASA_READINESS_PLAN.md",
      timestamp: "2026-08-14T10:01:00Z",
    },
  ]);
  assert.equal(attributed[0]?.key, "CASA_READINESS_PLAN");
  assert.equal(attributed[1]?.key, "CASA_READINESS_PLAN");
});

test("lead-up mentioning a file does not bind; two files in the final reply stay unlabeled", () => {
  const attributed = attributeThreadPlans([
    {
      role: "user",
      text: "Work on the casa plan",
      timestamp: "2026-08-14T10:00:00Z",
    },
    {
      role: "assistant",
      text: "Reading CASA_READINESS_PLAN.md",
      timestamp: "2026-08-14T10:01:00Z",
    },
    {
      role: "assistant",
      text: "Compare CASA_READINESS_PLAN.md and CASA_T2_FEATURES_PLAN.md",
      timestamp: "2026-08-14T10:02:00Z",
    },
  ]);
  assert.equal(attributed[0], null);
  assert.equal(attributed[1], null);
  assert.equal(attributed[2], null);
});

test("isInheritPrompt", () => {
  assert.equal(isInheritPrompt("yes"), true);
  assert.equal(isInheritPrompt("Please continue with the CASA plan"), true);
  assert.equal(isInheritPrompt("all done"), true);
  assert.equal(
    isInheritPrompt(
      "K. now that we are done with casa review i want to submit to google a much longer request about DWD and org-wide access for the enterprise workspace",
    ),
    false,
  );
});

test("holds pastes, attachments, and short questions; drops a new prose ask", () => {
  const dsnPaste = [
    "DSN: https://abc@o1.ingest.us.sentry.io/2",
    "--------",
    "## Install",
    "We recommend installing the SDK with the wizard.",
    "https://docs.sentry.io/platforms/apple/guides/macos/",
  ].join("\n");

  const attributed = attributeThreadPlans([
    {
      role: "user",
      text: "Work from docs/plans/LINUX_SYNC_PLAN.md",
      timestamp: "2026-08-14T02:04:00Z",
    },
    {
      role: "assistant",
      text: "I'll wire it up.",
      timestamp: null,
    },
    {
      role: "assistant",
      text: "SDK is in. Next is credentials.",
      timestamp: null,
    },
    { role: "user", text: dsnPaste, timestamp: "2026-08-14T02:14:00Z" },
    {
      role: "user",
      text: "@/Users/me/.cursor/projects/demo/terminals/1.txt:784-788",
      timestamp: "2026-08-14T04:08:00Z",
    },
    {
      role: "user",
      text: "where do I get these, i didnt see them in the instructions @.env.production (56-57)",
      timestamp: "2026-08-14T04:14:00Z",
    },
    { role: "user", text: "all done", timestamp: "2026-08-14T04:17:00Z" },
    {
      role: "user",
      text: "what do i put in the last two fields",
      timestamp: "2026-08-14T05:13:00Z",
    },
  ]);

  for (const plan of attributed) {
    assert.equal(plan?.key, "LINUX_SYNC_PLAN");
  }
  assert.equal(attributed[0]?.source, "named");
  assert.equal(attributed[3]?.source, "inherited");
  assert.equal(attributed[5]?.source, "inherited");
});

test("long unlabeled prose without a plan file ends the span", () => {
  const attributed = attributeThreadPlans([
    {
      role: "user",
      text: "Work from docs/plans/LINUX_SYNC_PLAN.md",
      timestamp: "2026-08-13T10:00:00Z",
    },
    { role: "assistant", text: "Starting.", timestamp: "2026-08-13T10:01:00Z" },
    {
      role: "user",
      text: "New direction for a while: I need a write-up of how billing works on the marketing site, including seats, invoices, and the public pricing page copy. No more linux sync work.",
      timestamp: "2026-08-13T10:05:00Z",
    },
    {
      role: "assistant",
      text: "Billing on the marketing site uses Stripe.",
      timestamp: "2026-08-13T10:06:00Z",
    },
  ]);

  assert.equal(attributed[0]?.key, "LINUX_SYNC_PLAN");
  assert.equal(attributed[2], null);
  assert.equal(attributed[3], null);
});

test("isOperationalFollowUp and isShortHold", () => {
  assert.equal(
    isOperationalFollowUp("@/Users/me/.cursor/projects/demo/terminals/1.txt:10-12"),
    true,
  );
  assert.equal(
    isOperationalFollowUp(
      "DSN: https://abc@o1.ingest.us.sentry.io/2\n## Install\nhttps://docs.sentry.io/a\nhttps://docs.sentry.io/b\nmore install notes from the vendor wizard follow here.",
    ),
    true,
  );
  assert.equal(isShortHold("where do I get these?"), true);
  assert.equal(
    isShortHold("Forget that — how does billing work on the marketing site?"),
    false,
  );
});

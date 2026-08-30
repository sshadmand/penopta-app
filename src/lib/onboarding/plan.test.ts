import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_ONBOARDING_SELECTIONS,
  onboardingChoiceSummary,
  onboardingHeardLines,
  onboardingReadyToContinue,
  onboardingSetupItems,
  onboardingSubmittedSelections,
  onboardingStepAnswered,
  onboardingSteps,
  requiredOnboardingSetupItems,
  type OnboardingSelections,
} from "./plan";

function ids(selections: Partial<OnboardingSelections>): string[] {
  return onboardingSetupItems({
    ...EMPTY_ONBOARDING_SELECTIONS,
    ...selections,
  }).map((item) => item.id);
}

test("empty selections produce no setup items", () => {
  assert.deepEqual(ids({}), []);
});

test("chat plus Claude lists MCP, hourly skill, and the LLM extra", () => {
  assert.deepEqual(ids({ chat: true, claude: true }), [
    "claude-mcp",
    "claude-skill",
    "llm-key",
  ]);
});

test("chat plus ChatGPT lists MCP, hourly skill, and the LLM extra", () => {
  assert.deepEqual(ids({ chat: true, chatgpt: true }), [
    "chatgpt-mcp",
    "chatgpt-skill",
    "llm-key",
  ]);
});

test("chat without an interface lists nothing", () => {
  assert.deepEqual(ids({ chat: true }), []);
});

test("code plus Mac lists the Mac app", () => {
  assert.deepEqual(ids({ code: true, mac: true }), ["macos", "llm-key"]);
});

test("code plus Linux lists host sync", () => {
  assert.deepEqual(ids({ code: true, linux: true }), ["linux", "llm-key"]);
});

test("Cursor still requires the Mac app even if Mac is unchecked", () => {
  assert.deepEqual(ids({ code: true, cursor: true }), ["macos", "llm-key"]);
});

test("Cursor and OS selections are ignored unless they code", () => {
  assert.deepEqual(
    ids({ cursor: true, mac: true, linux: true, claude: true }),
    [],
  );
});

test("chat and code together combine skills with host sync", () => {
  assert.deepEqual(
    ids({
      chat: true,
      code: true,
      claude: true,
      mac: true,
      linux: true,
    }),
    ["claude-mcp", "claude-skill", "macos", "linux", "llm-key"],
  );
});

test("required items omit the LLM extra", () => {
  const required = requiredOnboardingSetupItems({
    ...EMPTY_ONBOARDING_SELECTIONS,
    chat: true,
    claude: true,
  }).map((item) => item.id);
  assert.deepEqual(required, ["claude-mcp", "claude-skill"]);
});

test("Continue stays off until every visible card is answered", () => {
  assert.equal(onboardingReadyToContinue(EMPTY_ONBOARDING_SELECTIONS), false);
  assert.equal(
    onboardingReadyToContinue({
      ...EMPTY_ONBOARDING_SELECTIONS,
      chat: true,
    }),
    false,
  );
  assert.equal(
    onboardingReadyToContinue({
      ...EMPTY_ONBOARDING_SELECTIONS,
      chat: true,
      noneInterface: true,
    }),
    true,
  );
});

test("skipping every card is enough to Continue", () => {
  assert.equal(
    onboardingReadyToContinue({
      ...EMPTY_ONBOARDING_SELECTIONS,
      noneWork: true,
      noneInterface: true,
    }),
    true,
  );
});

test("code still needs an OS pick or skip", () => {
  assert.equal(
    onboardingReadyToContinue({
      ...EMPTY_ONBOARDING_SELECTIONS,
      code: true,
      noneInterface: true,
    }),
    false,
  );
  assert.equal(
    onboardingReadyToContinue({
      ...EMPTY_ONBOARDING_SELECTIONS,
      code: true,
      noneInterface: true,
      noneOs: true,
    }),
    true,
  );
});

test("skipping OS does not list Mac even if Cursor is checked", () => {
  assert.deepEqual(ids({ code: true, cursor: true, noneOs: true }), []);
});

test("OS step is only included after they say they code", () => {
  assert.deepEqual(onboardingSteps(EMPTY_ONBOARDING_SELECTIONS), [
    "work",
    "interfaces",
    "review",
  ]);
  assert.deepEqual(
    onboardingSteps({ ...EMPTY_ONBOARDING_SELECTIONS, code: true }),
    ["work", "interfaces", "os", "review"],
  );
});

test("each step is answered on its own", () => {
  assert.equal(
    onboardingStepAnswered("work", EMPTY_ONBOARDING_SELECTIONS),
    false,
  );
  assert.equal(
    onboardingStepAnswered("work", {
      ...EMPTY_ONBOARDING_SELECTIONS,
      chat: true,
    }),
    true,
  );
  assert.equal(
    onboardingStepAnswered("os", {
      ...EMPTY_ONBOARDING_SELECTIONS,
      code: true,
    }),
    false,
  );
  assert.equal(
    onboardingStepAnswered("review", EMPTY_ONBOARDING_SELECTIONS),
    true,
  );
});

test("choice summary recaps picks and skips OS when they don’t code", () => {
  const chatOnly = onboardingChoiceSummary({
    ...EMPTY_ONBOARDING_SELECTIONS,
    chat: true,
    claude: true,
  });
  assert.deepEqual(
    chatOnly.map((row) => row.value),
    ["Chat for text and docs", "Claude"],
  );

  const withOs = onboardingChoiceSummary({
    ...EMPTY_ONBOARDING_SELECTIONS,
    code: true,
    noneInterface: true,
    mac: true,
    linux: true,
  });
  assert.equal(withOs.length, 3);
  assert.equal(withOs[2]?.value, "Apple Mac · Linux server");
});

test("heard lines fill in as each card is answered", () => {
  assert.deepEqual(onboardingHeardLines(EMPTY_ONBOARDING_SELECTIONS), []);
  assert.deepEqual(
    onboardingHeardLines({
      ...EMPTY_ONBOARDING_SELECTIONS,
      code: true,
      chat: true,
    }).map((line) => line.text),
    ["You use your agents to code, work, and chat."],
  );
  assert.deepEqual(
    onboardingHeardLines({
      ...EMPTY_ONBOARDING_SELECTIONS,
      chat: true,
      claude: true,
      chatgpt: true,
    }).map((line) => line.text),
    [
      "You use your agents to chat for text and docs.",
      "You use Claude and ChatGPT.",
    ],
  );
  assert.deepEqual(
    onboardingHeardLines({
      ...EMPTY_ONBOARDING_SELECTIONS,
      code: true,
      cursor: true,
      mac: true,
      linux: true,
    }).map((line) => line.text),
    [
      "You use your agents to code and get work done.",
      "You use Cursor.",
      "Your software lives on a Mac and a Linux server.",
    ],
  );
  assert.deepEqual(
    onboardingHeardLines({
      ...EMPTY_ONBOARDING_SELECTIONS,
      noneWork: true,
      noneInterface: true,
    }),
    [],
  );
  assert.deepEqual(
    onboardingHeardLines({
      ...EMPTY_ONBOARDING_SELECTIONS,
      code: true,
      noneInterface: true,
      noneOs: true,
    }).map((line) => line.text),
    ["You use your agents to code and get work done."],
  );
});

test("submitted selections omit the current page until Continue", () => {
  const filled = {
    ...EMPTY_ONBOARDING_SELECTIONS,
    code: true,
    claude: true,
    mac: true,
  };
  assert.deepEqual(onboardingSubmittedSelections(filled, "work"), {
    ...EMPTY_ONBOARDING_SELECTIONS,
  });
  assert.equal(onboardingSubmittedSelections(filled, "interfaces").code, true);
  assert.equal(
    onboardingSubmittedSelections(filled, "interfaces").claude,
    false,
  );
  assert.equal(onboardingSubmittedSelections(filled, "os").claude, true);
  assert.equal(onboardingSubmittedSelections(filled, "os").mac, false);
  assert.equal(onboardingSubmittedSelections(filled, "review").mac, true);
});

import { integrationPath } from "@/lib/integrations/paths";

/** Shared skip row on each onboarding card. */
export const ONBOARDING_NONE_LABEL = "None of these fit my work style…yet";

/** Left-side checkboxes on the welcome onboarding modal. */
export type OnboardingSelections = {
  /** Codes or uses local workspaces — show Mac/Linux and Cursor. */
  code: boolean;
  /** Chat agents for text and docs — skills + MCP. */
  chat: boolean;
  /** Skip the work-style card. */
  noneWork: boolean;
  claude: boolean;
  chatgpt: boolean;
  cursor: boolean;
  /** Skip the interfaces card. */
  noneInterface: boolean;
  mac: boolean;
  linux: boolean;
  /** Skip the OS card. */
  noneOs: boolean;
};

export const EMPTY_ONBOARDING_SELECTIONS: OnboardingSelections = {
  code: false,
  chat: false,
  noneWork: false,
  claude: false,
  chatgpt: false,
  cursor: false,
  noneInterface: false,
  mac: false,
  linux: false,
  noneOs: false,
};

export type OnboardingSetupItem = {
  id: string;
  title: string;
  detail: string;
  /** Plain-language next step on the recap page. */
  action: string;
  href: string;
  /** Dashed “extra” row (LLM key). */
  extra?: boolean;
};

/**
 * What to install given the welcome checkboxes.
 * Chat → MCP + hourly skill per interface. Code → Mac/Linux sync.
 * Cursor currently needs the Mac app even if Mac isn’t checked.
 */
export function onboardingSetupItems(
  selections: OnboardingSelections,
): OnboardingSetupItem[] {
  const items: OnboardingSetupItem[] = [];
  const code = selections.code;
  const chat = selections.chat;

  if (chat && selections.claude) {
    items.push(
      {
        id: "claude-mcp",
        title: "Claude MCP",
        detail: "Live Penopta context in Claude chat.",
        action:
          "In Claude, add Penopta as an MCP connector so chat can see this workspace.",
        href: integrationPath("claude"),
      },
      {
        id: "claude-skill",
        title: "Claude hourly skill",
        detail: "Sync Claude projects and chats on a schedule.",
        action:
          "Save the Penopta skill in Claude and create an hourly scheduled task so projects and chats sync.",
        href: integrationPath("claude"),
      },
    );
  }

  if (chat && selections.chatgpt) {
    items.push(
      {
        id: "chatgpt-mcp",
        title: "ChatGPT MCP",
        detail: "Live Penopta context in ChatGPT.",
        action:
          "In ChatGPT, add Penopta as an MCP server so chat can see this workspace.",
        href: integrationPath("chatgpt"),
      },
      {
        id: "chatgpt-skill",
        title: "ChatGPT hourly skill",
        detail: "Sync ChatGPT projects and chats on a schedule.",
        action:
          "Create a ChatGPT scheduled task with the Penopta sync skill so projects and chats upload hourly.",
        href: integrationPath("chatgpt"),
      },
    );
  }

  const needsMac =
    code && !selections.noneOs && (selections.mac || selections.cursor);
  if (needsMac) {
    const bits = [
      selections.cursor ? "Cursor" : null,
      selections.claude ? "Claude Code" : null,
      selections.chatgpt ? "Codex" : null,
    ].filter((bit): bit is string => bit !== null);
    const local = bits.length > 0 ? bits.join(", ") : "local agent sessions";
    items.push({
      id: "macos",
      title: "Penopta Sync (Mac)",
      detail: `Reads ${local} on your Mac.`,
      action: `Install Penopta Sync, sign in, and grant folder access so ${local} upload from your Mac.`,
      href: integrationPath("macos"),
    });
  }

  if (code && selections.linux && !selections.noneOs) {
    items.push({
      id: "linux",
      title: "Linux host sync",
      detail: "Headless CLI for Claude Code and Codex on a server.",
      action:
        "On the Linux box, install the host-sync CLI, run login, and confirm the machine in the browser.",
      href: integrationPath("linux"),
    });
  }

  if (items.length > 0) {
    items.push({
      id: "llm-key",
      title: "LLM key",
      detail: "Optional — powers summaries and project chat.",
      action:
        "Optional: add an org LLM key so Penopta can write summaries and answer project chat.",
      href: integrationPath("ai"),
      extra: true,
    });
  }

  return items;
}

export function requiredOnboardingSetupItems(
  selections: OnboardingSelections,
): OnboardingSetupItem[] {
  return onboardingSetupItems(selections).filter((item) => !item.extra);
}

/** True once every visible card has a pick or a “none yet” skip. */
export function onboardingReadyToContinue(
  selections: OnboardingSelections,
): boolean {
  return onboardingSteps(selections).every((step) =>
    onboardingStepAnswered(step, selections),
  );
}

export type OnboardingStepId = "work" | "interfaces" | "os" | "review";

export const ONBOARDING_STEP_COPY: Record<
  OnboardingStepId,
  { title: string; description: string; noneLabel: string }
> = {
  work: {
    title: "How do you work with agents?",
    description: "Code and workspaces, chat for text and docs, or both.",
    noneLabel: ONBOARDING_NONE_LABEL,
  },
  interfaces: {
    title: "Which agents do you use?",
    description: "Pick every agent you actually work in.",
    noneLabel: "I don’t use any of these agents",
  },
  os: {
    title: "Where is your software or websites?",
    description: "Which OS do you work or code on?",
    noneLabel: ONBOARDING_NONE_LABEL,
  },
  review: {
    title: "Here’s what you selected",
    description: "A recap of your answers, and what to set up next.",
    noneLabel: "",
  },
};

export type OnboardingChoiceRow = {
  label: string;
  value: string;
};

export type OnboardingHeardLine = {
  id: "work" | "interfaces" | "os";
  text: string;
};

function joinEnglish(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** Running sentences for the right rail as they check boxes. */
export function onboardingHeardLines(
  selections: OnboardingSelections,
): OnboardingHeardLine[] {
  const lines: OnboardingHeardLine[] = [];

  if (selections.code && selections.chat) {
    lines.push({
      id: "work",
      text: "You use your agents to code, work, and chat.",
    });
  } else if (selections.code) {
    lines.push({
      id: "work",
      text: "You use your agents to code and get work done.",
    });
  } else if (selections.chat) {
    lines.push({
      id: "work",
      text: "You use your agents to chat for text and docs.",
    });
  }

  const agents: string[] = [];
  if (selections.claude) agents.push("Claude");
  if (selections.chatgpt) agents.push("ChatGPT");
  if (selections.code && selections.cursor) agents.push("Cursor");
  if (agents.length > 0) {
    lines.push({
      id: "interfaces",
      text: `You use ${joinEnglish(agents)}.`,
    });
  }

  if (selections.code) {
    const places: string[] = [];
    if (selections.mac) places.push("a Mac");
    if (selections.linux) places.push("a Linux server");
    if (places.length > 0) {
      lines.push({
        id: "os",
        text: `Your software lives on ${joinEnglish(places)}.`,
      });
    }
  }

  return lines;
}

/** Human recap of the answers, used on the final page. */
export function onboardingChoiceSummary(
  selections: OnboardingSelections,
): OnboardingChoiceRow[] {
  const work: string[] = [];
  if (selections.code) work.push("Code and workspaces");
  if (selections.chat) work.push("Chat for text and docs");
  if (selections.noneWork) work.push("None of these yet");

  const agents: string[] = [];
  if (selections.claude) agents.push("Claude");
  if (selections.chatgpt) agents.push("ChatGPT");
  if (selections.code && selections.cursor) agents.push("Cursor");
  if (selections.noneInterface) agents.push("None of these agents");

  const rows: OnboardingChoiceRow[] = [
    {
      label: ONBOARDING_STEP_COPY.work.title,
      value: work.join(" · ") || "Not answered",
    },
    {
      label: ONBOARDING_STEP_COPY.interfaces.title,
      value: agents.join(" · ") || "Not answered",
    },
  ];

  if (selections.code) {
    const os: string[] = [];
    if (selections.mac) os.push("Apple Mac");
    if (selections.linux) os.push("Linux server");
    if (selections.noneOs) os.push("None of these yet");
    rows.push({
      label: ONBOARDING_STEP_COPY.os.title,
      value: os.join(" · ") || "Not answered",
    });
  }

  return rows;
}

/** Later steps can hide or change based on earlier answers. */
export function onboardingSteps(
  selections: OnboardingSelections,
): OnboardingStepId[] {
  const steps: OnboardingStepId[] = ["work", "interfaces"];
  if (selections.code) steps.push("os");
  steps.push("review");
  return steps;
}

export function onboardingStepAnswered(
  step: OnboardingStepId,
  selections: OnboardingSelections,
): boolean {
  switch (step) {
    case "work":
      return selections.code || selections.chat || selections.noneWork;
    case "interfaces":
      return (
        selections.claude ||
        selections.chatgpt ||
        (selections.code && selections.cursor) ||
        selections.noneInterface
      );
    case "os":
      return selections.mac || selections.linux || selections.noneOs;
    case "review":
      return true;
  }
}

const STEP_SELECTION_KEYS: Record<
  OnboardingStepId,
  (keyof OnboardingSelections)[]
> = {
  work: ["code", "chat", "noneWork"],
  interfaces: ["claude", "chatgpt", "cursor", "noneInterface"],
  os: ["mac", "linux", "noneOs"],
  review: [],
};

/**
 * Answers from steps already submitted with Continue. The current page is
 * omitted so the right rail stays empty until they continue (and clears again
 * if they go back).
 */
export function onboardingSubmittedSelections(
  selections: OnboardingSelections,
  currentStep: OnboardingStepId,
): OnboardingSelections {
  const submitted = { ...EMPTY_ONBOARDING_SELECTIONS };
  const steps = onboardingSteps(selections);
  const cutoff = steps.indexOf(currentStep);
  const end = cutoff < 0 ? 0 : cutoff;
  for (let i = 0; i < end; i++) {
    const step = steps[i];
    for (const key of STEP_SELECTION_KEYS[step]) {
      submitted[key] = selections[key];
    }
  }
  return submitted;
}

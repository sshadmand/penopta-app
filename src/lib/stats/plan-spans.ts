import { isHumanRole, leadUpFlags } from "@/lib/threads/lead-up";

/** Process docs that show up next to real work plans. */
const SKIP_PLANS = new Set(["PLANNING.MD", "PLAN_AND_REVIEW.MD"]);

const PLAN_FILE_RE =
  /\b([A-Za-z][A-Za-z0-9._-]*plan(?:ning)?\.md)\b/gi;

const INHERIT_RE =
  /^(?:please\s+)?(?:yes|yep|yeah|ok|okay|k\.?|lgtm|continue|keep going|go ahead|do it|proceed|ship it|next|what(?:'s|s| is)? next|all done|done|thanks|thank you|got it|that worked|works|perfect)\b/i;

const INHERIT_ANYWHERE_RE = /\b(continue|keep going|what(?:'s|s) next)\b/i;

/** Explicit “new job” — do not hold the previous plan. */
const TOPIC_SHIFT_RE =
  /\b(forget that|unrelated|different (?:topic|question|ask)|switching to|new (?:topic|question))\b/i;

const ATTACHMENT_RE =
  /(?:^|\s)@\S+|\/Users\/|\/home\/|terminals\/|\.\w+:\d+/;

const PASTE_MARKER_RE = /https?:\/\/|\b[A-Z][A-Z0-9_]{3,}=/;

export type PlanAttribution = "named" | "inherited";

export type TranscriptTurn = {
  role: string;
  text: string;
  timestamp: string | null;
};

export type AttributedPlan = {
  key: string;
  fileName: string;
  source: PlanAttribution;
};

/**
 * Canonical plan id: uppercase, hyphens to underscores, no .md.
 * `casa-t2-features-plan.md` and `CASA_T2_FEATURES_PLAN.md` merge.
 */
export function planKey(fileName: string): string {
  return fileName
    .trim()
    .replace(/\.md$/i, "")
    .replace(/-/g, "_")
    .toUpperCase();
}

export function isSkippedPlan(fileName: string): boolean {
  return SKIP_PLANS.has(planKey(fileName) + ".MD");
}

/** Filenames mentioned in a human turn. */
export function extractPlanFiles(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  PLAN_FILE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLAN_FILE_RE.exec(text)) !== null) {
    const raw = match[1];
    if (!raw || isSkippedPlan(raw)) continue;
    const key = planKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(raw);
  }
  return found;
}

function collapsed(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isTopicShift(text: string): boolean {
  return TOPIC_SHIFT_RE.test(collapsed(text));
}

/** Short “yes / continue / what’s next” — inherit the last named plan. */
export function isInheritPrompt(text: string): boolean {
  const trimmed = collapsed(text);
  if (!trimmed || trimmed.length > 120) return false;
  if (INHERIT_RE.test(trimmed)) return true;
  return trimmed.length <= 80 && INHERIT_ANYWHERE_RE.test(trimmed);
}

/**
 * Paste, attachment, or dump — still the current job, even when long.
 * Does not start a span; only holds one that already started.
 */
export function isOperationalFollowUp(text: string): boolean {
  const trimmed = collapsed(text);
  if (!trimmed || isTopicShift(trimmed)) return false;
  if (ATTACHMENT_RE.test(text) || ATTACHMENT_RE.test(trimmed)) return true;
  if (/```/.test(text)) return true;
  if (PASTE_MARKER_RE.test(text) && trimmed.length > 80) return true;
  if (trimmed.length < 200) return false;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (letters / trimmed.length < 0.55) return true;
  return text.split("\n").length >= 8;
}

/**
 * Short unlabeled follow-up (“where do I get these?”). Topic-shift
 * phrases still end the span.
 */
export function isShortHold(text: string): boolean {
  const trimmed = collapsed(text);
  if (!trimmed || trimmed.length > 160) return false;
  return !isTopicShift(trimmed);
}

function holdsActivePlan(text: string): boolean {
  return (
    isInheritPrompt(text) ||
    isOperationalFollowUp(text) ||
    isShortHold(text)
  );
}

function namedPlan(fileName: string): AttributedPlan {
  return { key: planKey(fileName), fileName, source: "named" };
}

/**
 * Walk a thread in order. A `*plan.md` in a human turn starts a span.
 * Short follow-ups, pastes, and attachments inherit it. Long unlabeled
 * prose ends the span; the next final assistant reply can re-bind when
 * it names exactly one plan file. Lead-up play-by-play is ignored. Two
 * or more files in that reply stay unlabeled.
 */
export function attributeThreadPlans(
  turns: TranscriptTurn[],
): Array<AttributedPlan | null> {
  let active: AttributedPlan | null = null;
  let pendingResolve = false;
  let lastHumanIndex = -1;
  const leadUp = leadUpFlags(turns);
  const out: Array<AttributedPlan | null> = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn) continue;

    if (isHumanRole(turn.role)) {
      const named = extractPlanFiles(turn.text);
      if (named.length > 0) {
        const fileName = named[named.length - 1] ?? named[0]!;
        active = namedPlan(fileName);
        pendingResolve = false;
      } else if (active && holdsActivePlan(turn.text)) {
        active = {
          key: active.key,
          fileName: active.fileName,
          source: "inherited",
        };
        pendingResolve = false;
      } else {
        active = null;
        pendingResolve = true;
        lastHumanIndex = out.length;
      }
    } else if (pendingResolve && !leadUp[i]) {
      const named = extractPlanFiles(turn.text);
      if (named.length === 1 && named[0]) {
        active = namedPlan(named[0]);
        pendingResolve = false;
        if (lastHumanIndex >= 0 && out[lastHumanIndex] == null) {
          out[lastHumanIndex] = active;
        }
      } else {
        pendingResolve = false;
      }
    }

    out.push(active);
  }

  return out;
}

/** Leading token for a feature/workstream group (`CASA_T2_…` → `CASA`). */
export function planFeatureKey(key: string): string {
  const base = key.replace(/_PLAN$/i, "");
  return base.split("_")[0] ?? base;
}

/** `CASA_READINESS_PLAN` → `CASA readiness`. */
export function humanizePlanKey(key: string): string {
  const base = key.replace(/_PLAN$/i, "").replaceAll("_", " ").trim();
  if (!base) return key;
  return base
    .split(" ")
    .map((part, index) => {
      if (/^[A-Z0-9]{2,8}$/.test(part) || /\d/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    })
    .join(" ");
}

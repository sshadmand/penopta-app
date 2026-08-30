/**
 * Version of the pasteable hourly sync skill
 * (`sync-skill/shared.md` + provider overlays).
 * Bump when scheduled-task instructions change in a way that matters
 * (tool order, discovery, private rules, delivery, required fields) —
 * including provider-overlay-only changes.
 * Keep separate from `schemaVersion` (JSON payload contract).
 */
export const SYNC_SKILL_VERSION = 2;

/**
 * Oldest skill version still accepted for delivery. Bump only when older
 * pastes would do the wrong thing (not merely missing nice-to-haves).
 */
export const SYNC_SKILL_MIN_COMPAT = 1;

/** Payload / producer id used by the hourly scheduled skill. */
export const HOURLY_SYNC_AGENT_ID = "hourly-thread-context-sync";

export type SkillCompat = "ok" | "warn" | "block";

export type SkillStatus = {
  reported: number | null;
  current: number;
  minCompat: number;
  stale: boolean;
  compat: SkillCompat;
  updateHint: string | null;
};

const RECOPY_HINT =
  "Your schedule may be on an outdated Penopta sync skill. " +
  "Re-copy Instructions from Penopta → Integrations, then re-run once.";

/**
 * Compare a client-reported skill version to the server's current skill.
 * Missing/null counts as stale + warn during rollout (schedules that predate
 * skillVersion still deliver).
 */
export function evaluateSkillVersion(
  reported: number | null | undefined,
): SkillStatus {
  const current = SYNC_SKILL_VERSION;
  const minCompat = SYNC_SKILL_MIN_COMPAT;
  const value =
    typeof reported === "number" && Number.isInteger(reported) && reported > 0
      ? reported
      : null;

  if (value === null) {
    return {
      reported: null,
      current,
      minCompat,
      stale: true,
      compat: "warn",
      updateHint: RECOPY_HINT,
    };
  }

  if (value < minCompat) {
    return {
      reported: value,
      current,
      minCompat,
      stale: true,
      compat: "block",
      updateHint:
        `Sync skill v${value} is no longer supported (need ≥ v${minCompat}; ` +
        `current is v${current}). Re-copy Instructions from Penopta → Integrations.`,
    };
  }

  if (value < current) {
    return {
      reported: value,
      current,
      minCompat,
      stale: true,
      compat: "warn",
      updateHint:
        `Your schedule is on sync skill v${value}; current is v${current}. ` +
        "Re-copy Instructions from Penopta → Integrations, then re-run once.",
    };
  }

  return {
    reported: value,
    current,
    minCompat,
    stale: false,
    compat: "ok",
    updateHint: null,
  };
}

/** Optional Zod-friendly field shared by sync MCP tools. */
export const skillVersionFieldDescription =
  `Version of the Penopta sync skill pasted into this schedule (currently ${SYNC_SKILL_VERSION}). ` +
  "Pass the number from the skill header on every sync-related call so Penopta can detect stale instructions.";

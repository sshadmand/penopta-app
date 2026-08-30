/**
 * Lead-up vs final reply.
 *
 * Claude (and similar agents) emit several assistant texts in one run —
 * play-by-play while tools run — then a last message that is the actual
 * reply. Those earlier assistant turns are **lead-up**. We do not get a
 * flag from the producer; the last assistant text before the next human
 * turn is the final reply.
 */

export function isHumanRole(role: string): boolean {
  const r = role.trim().toLowerCase();
  return r === "user" || r === "human";
}

export function isAgentRole(role: string): boolean {
  const r = role.trim().toLowerCase();
  return r === "assistant" || r === "ai" || r === "agent";
}

/** True for assistant play-by-play; false for humans and the final reply. */
export function leadUpFlags(items: readonly { role: string }[]): boolean[] {
  const flags = items.map(() => false);
  let runStart = -1;

  const closeRun = (endExclusive: number) => {
    if (runStart < 0) return;
    for (let i = runStart; i < endExclusive - 1; i++) {
      flags[i] = true;
    }
    runStart = -1;
  };

  for (let i = 0; i < items.length; i++) {
    if (isAgentRole(items[i].role)) {
      if (runStart < 0) runStart = i;
    } else {
      closeRun(i);
    }
  }
  closeRun(items.length);

  return flags;
}

/** Drop lead-up assistant turns; keep humans and each run's final reply. */
export function withoutLeadUp<T extends { role: string }>(items: T[]): T[] {
  const flags = leadUpFlags(items);
  return items.filter((_, i) => !flags[i]);
}

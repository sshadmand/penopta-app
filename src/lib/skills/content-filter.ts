/**
 * Content filter for workgroup skills and rules.
 *
 * Skills are written by an LLM from synced transcripts (untrusted data) and
 * then handed to other people's agents as instructions, with no approval
 * step. Everything goes through here before it is saved: secrets are
 * redacted, and drafts that read like an attack on the agent are dropped.
 */

const REDACTED = "[redacted]";

/** Token / key shapes that should never land in a skill. */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  // Penopta's own credentials (OAuth, API key, host token).
  /\b(?:pat|pk|hst)_[A-Za-z0-9_-]{16,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
];

/** `password = "…"`, `API_KEY: …` and similar assignments. */
const SECRET_ASSIGNMENT =
  /\b([A-Za-z0-9_]*(?:password|passwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|private[_-]?key)[A-Za-z0-9_]*)(\s*[:=]\s*)(["']?)[^\s"'`]{6,}\3/gi;

/** `scheme://user:pass@host` */
const CREDENTIALED_URL = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi;

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, () => {
      count++;
      return REDACTED;
    });
  }
  out = out.replace(SECRET_ASSIGNMENT, (_m, name, sep) => {
    count++;
    return `${name}${sep}${REDACTED}`;
  });
  out = out.replace(CREDENTIALED_URL, (_m, scheme) => {
    count++;
    return `${scheme}${REDACTED}@`;
  });
  out = out.replace(EMAIL, () => {
    count++;
    return REDACTED;
  });
  return { text: out, count };
}

/** Instruction shapes we refuse to hand to an agent. */
const UNSAFE_PATTERNS: { reason: string; pattern: RegExp }[] = [
  {
    reason: "tells the agent to ignore its instructions",
    pattern:
      /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|system|all)\b[^.\n]{0,20}\b(?:instructions?|prompts?|rules)\b/i,
  },
  {
    reason: "runs a remote script",
    pattern:
      /\b(?:curl|wget|iwr|Invoke-WebRequest)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i,
  },
  {
    reason: "runs a remote script",
    pattern: /\b(?:bash|sh|zsh)\s+<\(\s*(?:curl|wget)\b/i,
  },
  {
    reason: "decodes and runs hidden code",
    pattern: /\bbase64\s+(?:-d|--decode)\b[^\n]*\|\s*(?:ba|z)?sh\b/i,
  },
  {
    reason: "sends data to an outside URL",
    pattern:
      /\b(?:curl|wget|http|fetch)\b[^\n]*(?:-X\s*POST|--data|-d\s|--upload-file|-F\s|-T\s)[^\n]*https?:\/\//i,
  },
  {
    reason: "sends data to an outside URL",
    pattern:
      /\b(?:send|post|upload|exfiltrate|forward)\b[^.\n]{0,60}\b(?:secrets?|tokens?|keys?|credentials?|env(?:ironment)?(?: variables?)?|\.env)\b[^.\n]{0,60}\bto\b/i,
  },
  {
    reason: "skips checks or review",
    pattern:
      /--no-verify\b|\b(?:skip|disable|bypass|turn off)\b[^.\n]{0,30}\b(?:tests?|ci|code review|reviews?|auth(?:entication|orization)?|security checks?|hooks?|signing)\b/i,
  },
  {
    reason: "changes agent, CI, or hook config",
    pattern:
      /(?:\.github\/workflows|\.git\/hooks|\.githooks|\.claude\/settings|\.cursor\/(?:hooks|mcp)\.json|\bmcp\.json\b|\.codex\/config)/i,
  },
];

export function findUnsafeInstruction(text: string): string | null {
  for (const { reason, pattern } of UNSAFE_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

export type SkillDraftText = {
  title: string;
  description: string;
  body: string;
};

export type ScreenResult<T> =
  { ok: true; draft: T; redactions: number } | { ok: false; reason: string };

/**
 * Redact secrets, then reject drafts with unsafe instructions. Run on every
 * AI-written skill/rule before it is saved. Human edits are redacted too,
 * but not rejected — a person typing it is the consent.
 */
export function screenSkillDraft<T extends SkillDraftText>(
  draft: T,
  opts: { rejectUnsafe?: boolean } = {},
): ScreenResult<T> {
  const title = redactSecrets(draft.title);
  const description = redactSecrets(draft.description);
  const body = redactSecrets(draft.body);
  const next = {
    ...draft,
    title: title.text,
    description: description.text,
    body: body.text,
  };
  if (opts.rejectUnsafe ?? true) {
    const reason = findUnsafeInstruction(
      `${next.title}\n${next.description}\n${next.body}`,
    );
    if (reason) return { ok: false, reason };
  }
  return {
    ok: true,
    draft: next,
    redactions: title.count + description.count + body.count,
  };
}

/** Kebab-case slug safe for file and folder names (`penopta-<slug>`). */
export function normalizeSkillSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

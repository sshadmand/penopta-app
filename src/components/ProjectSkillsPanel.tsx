"use client";

import { History, Pencil, Plus, Power, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ChatMarkdown } from "@/components/ChatMarkdown";
import { RelativeTime } from "@/components/LocalTime";
import type { ProjectSkillKind } from "@/lib/db/schema";
import {
  distillProjectSkillsAction,
  listProjectSkillRevisionsAction,
  restoreProjectSkillRevisionAction,
  saveProjectSkillAction,
  setProjectSkillStatusAction,
  setSkillsCommitToRepoAction,
  type SkillInput,
} from "@/lib/skills/actions";
import type {
  ProjectSkillPublic,
  ProjectSkillRevisionPublic,
} from "@/lib/skills/data";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent";
const SECONDARY_BUTTON =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:bg-background disabled:opacity-60";
const PRIMARY_BUTTON =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-60";
const ICON_BUTTON =
  "grid size-7 place-items-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-60";

/** Workgroup skills and rules: view, add, edit, turn off, restore. */
export function ProjectSkillsPanel({
  projectId,
  skills,
  hasLlmKey,
  userNames,
  threadTitles,
  isOwner,
  commitToRepo,
}: {
  projectId: string;
  skills: ProjectSkillPublic[];
  hasLlmKey: boolean;
  isOwner: boolean;
  commitToRepo: boolean;
  userNames: Record<string, string>;
  /** Threads in this workgroup, for evidence links. */
  threadTitles: Record<string, string>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState<ProjectSkillKind | null>(null);
  const [distilling, startDistill] = useTransition();

  const rules = skills.filter((s) => s.kind === "rule");
  const workflows = skills.filter((s) => s.kind === "skill");

  function distill() {
    startDistill(async () => {
      const result = await distillProjectSkillsAction(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.text);
      router.refresh();
    });
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">Skills</h2>
            <p className="mt-1 text-sm text-muted">
              Know-how distilled from this workgroup&apos;s threads. Shared with
              everyone who can see the workgroup and live as soon as it&apos;s
              saved. Turn off anything you don&apos;t want agents to use.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {hasLlmKey ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={distilling}
                onClick={distill}
                title="Read threads synced since the last distill"
              >
                <Sparkles aria-hidden className="size-3.5" />
                {distilling ? "Distilling…" : "Distill now"}
              </button>
            ) : (
              <Link
                href="/settings/integrations/ai"
                className={SECONDARY_BUTTON}
              >
                Add an AI key to distill
              </Link>
            )}
          </div>
        </div>

        <RepoDelivery
          projectId={projectId}
          isOwner={isOwner}
          commitToRepo={commitToRepo}
        />

        <Section
          title="Rules"
          hint="One-line always / never conventions."
          onAdd={() => setAdding("rule")}
          addLabel="Add rule"
        >
          {adding === "rule" ? (
            <SkillForm
              projectId={projectId}
              kind="rule"
              onDone={() => setAdding(null)}
            />
          ) : null}
          {rules.length === 0 && adding !== "rule" ? (
            <Empty kind="rule" />
          ) : null}
          {rules.map((skill) => (
            <SkillCard
              key={skill.id}
              projectId={projectId}
              skill={skill}
              userNames={userNames}
              threadTitles={threadTitles}
            />
          ))}
        </Section>

        <Section
          title="Skills"
          hint="Step-by-step workflows with a “use when” trigger."
          onAdd={() => setAdding("skill")}
          addLabel="Add skill"
        >
          {adding === "skill" ? (
            <SkillForm
              projectId={projectId}
              kind="skill"
              onDone={() => setAdding(null)}
            />
          ) : null}
          {workflows.length === 0 && adding !== "skill" ? (
            <Empty kind="skill" />
          ) : null}
          {workflows.map((skill) => (
            <SkillCard
              key={skill.id}
              projectId={projectId}
              skill={skill}
              userNames={userNames}
              threadTitles={threadTitles}
            />
          ))}
        </Section>
      </div>
    </main>
  );
}

/** How skills reach repos, plus the owner's commit-to-git switch. */
function RepoDelivery({
  projectId,
  isOwner,
  commitToRepo,
}: {
  projectId: string;
  isOwner: boolean;
  commitToRepo: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await setSkillsCommitToRepoAction(projectId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next ? "Skill files can be committed" : "Skill files stay out of git",
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-sidebar px-4 py-3 text-sm">
      <p className="text-foreground">
        The{" "}
        <Link
          href="/settings/integrations/macos"
          className="font-medium underline-offset-2 hover:underline"
        >
          Penopta Mac app
        </Link>{" "}
        writes these into each teammate&apos;s repos for this workgroup, where
        Claude Code, Cursor, and Codex pick them up. Each person can turn that
        off in the app.
      </p>
      <label
        className={`mt-3 flex items-start gap-2 text-xs ${isOwner ? "text-foreground" : "text-muted"}`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={commitToRepo}
          disabled={!isOwner || pending}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          Let people commit skill files to git. Off: files stay local (added to
          the repo&apos;s <code className="font-mono">.git/info/exclude</code>).
          {isOwner ? null : " Only the workgroup owner can change this."}
        </span>
      </label>
    </div>
  );
}

function Section({
  title,
  hint,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  hint: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">
            {title}
          </p>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
        <button type="button" className={SECONDARY_BUTTON} onClick={onAdd}>
          <Plus aria-hidden className="size-3.5" />
          {addLabel}
        </button>
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Empty({ kind }: { kind: ProjectSkillKind }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      No {kind === "rule" ? "rules" : "skills"} yet. Run{" "}
      <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-xs">
        /distill
      </code>{" "}
      in the workgroup chat, or add one by hand.
    </p>
  );
}

function authorLabel(
  skill: { updatedByUserId: string | null; model: string | null },
  userNames: Record<string, string>,
): string {
  if (skill.updatedByUserId) {
    return userNames[skill.updatedByUserId] ?? "A teammate";
  }
  return "AI";
}

function SkillCard({
  projectId,
  skill,
  userNames,
  threadTitles,
}: {
  projectId: string;
  skill: ProjectSkillPublic;
  userNames: Record<string, string>;
  threadTitles: Record<string, string>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, startTransition] = useTransition();
  const off = skill.status === "off";

  function toggle() {
    startTransition(async () => {
      const result = await setProjectSkillStatusAction(
        projectId,
        skill.id,
        off ? "active" : "off",
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(off ? "Turned on" : "Turned off");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <SkillForm
        projectId={projectId}
        kind={skill.kind}
        skill={skill}
        onDone={() => setEditing(false)}
      />
    );
  }

  const evidence = skill.evidence.filter((e) => threadTitles[e.agentThreadId]);

  return (
    <article
      className={`rounded-xl border border-border bg-surface px-4 py-3 ${off ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {skill.title}
            {off ? (
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-2xs font-medium text-muted">
                Off
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {skill.humanEdited ? "Edited by " : "By "}
            {authorLabel(skill, userNames)} · v{skill.version} ·{" "}
            <RelativeTime at={skill.updatedAt} />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={ICON_BUTTON}
            title="Edit"
            aria-label="Edit"
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            className={ICON_BUTTON}
            title="History"
            aria-label="History"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            <History aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            className={ICON_BUTTON}
            title={off ? "Turn on" : "Turn off"}
            aria-label={off ? "Turn on" : "Turn off"}
            disabled={pending}
            onClick={toggle}
          >
            <Power aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>

      {skill.kind === "skill" && skill.description ? (
        <p className="mt-2 text-sm text-foreground">{skill.description}</p>
      ) : null}
      <div className="mt-2 text-foreground">
        {skill.kind === "rule" ? (
          <p className="text-sm">{skill.body}</p>
        ) : (
          <ChatMarkdown>{skill.body}</ChatMarkdown>
        )}
      </div>

      {evidence.length > 0 ? (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer select-none">
            Why ({evidence.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {evidence.map((e, i) => (
              <li key={`${e.agentThreadId}-${i}`}>
                <blockquote className="border-l-2 border-border pl-2 text-foreground">
                  {e.excerpt}
                </blockquote>
                <Link
                  href={`/projects/${projectId}?thread=${e.agentThreadId}`}
                  className="mt-0.5 inline-block hover:text-foreground"
                >
                  {threadTitles[e.agentThreadId]}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {showHistory ? (
        <SkillHistory
          projectId={projectId}
          skillId={skill.id}
          currentVersion={skill.version}
          userNames={userNames}
        />
      ) : null}
    </article>
  );
}

function SkillHistory({
  projectId,
  skillId,
  currentVersion,
  userNames,
}: {
  projectId: string;
  skillId: string;
  currentVersion: number;
  userNames: Record<string, string>;
}) {
  const router = useRouter();
  const [revisions, setRevisions] = useState<
    ProjectSkillRevisionPublic[] | null
  >(null);
  const [pending, startTransition] = useTransition();

  // Reload when the skill's version changes (edit, restore, distill).
  useEffect(() => {
    let cancelled = false;
    void listProjectSkillRevisionsAction(projectId, skillId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRevisions(result.revisions);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, skillId, currentVersion]);

  function restore(revisionId: string, version: number) {
    startTransition(async () => {
      const result = await restoreProjectSkillRevisionAction(
        projectId,
        skillId,
        revisionId,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Restored v${version}`);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">
        History
      </p>
      {revisions === null ? (
        <p className="mt-2 text-xs text-muted">Loading…</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {revisions.map((rev) => (
            <li
              key={rev.id}
              className="flex items-start justify-between gap-3 text-xs"
            >
              <div className="min-w-0">
                <p className="text-foreground">
                  v{rev.version} · {rev.title}
                  {rev.status === "off" ? " (off)" : ""}
                </p>
                <p className="text-muted">
                  {authorLabel(rev, userNames)} ·{" "}
                  <RelativeTime at={rev.createdAt} />
                </p>
              </div>
              {rev.version === currentVersion ? (
                <span className="shrink-0 text-muted">Current</span>
              ) : (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={pending}
                  onClick={() => restore(rev.id, rev.version)}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SkillForm({
  projectId,
  kind,
  skill,
  onDone,
}: {
  projectId: string;
  kind: ProjectSkillKind;
  skill?: ProjectSkillPublic;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(skill?.title ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [body, setBody] = useState(skill?.body ?? "");
  const [pending, startTransition] = useTransition();
  const isRule = kind === "rule";

  function save(event: React.FormEvent) {
    event.preventDefault();
    const input: SkillInput = { kind, title, description, body };
    startTransition(async () => {
      const result = await saveProjectSkillAction(
        projectId,
        skill?.id ?? null,
        input,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(skill ? "Saved" : isRule ? "Rule added" : "Skill added");
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      className="rounded-xl border border-accent/40 bg-surface px-4 py-3"
    >
      <label className="block text-xs font-medium text-muted">
        Name
        <input
          className={INPUT_CLASS}
          value={title}
          maxLength={120}
          placeholder={
            isRule ? "Webhook signatures" : "Debug failed webhook deliveries"
          }
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </label>
      {isRule ? null : (
        <label className="mt-3 block text-xs font-medium text-muted">
          Use when
          <input
            className={INPUT_CLASS}
            value={description}
            maxLength={300}
            placeholder="Use when a webhook delivery fails or retries."
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      )}
      <label className="mt-3 block text-xs font-medium text-muted">
        {isRule ? "Rule" : "Steps (markdown)"}
        <textarea
          className={`${INPUT_CLASS} ${isRule ? "min-h-16" : "min-h-40 font-mono text-xs"}`}
          value={body}
          maxLength={isRule ? 300 : 6000}
          placeholder={
            isRule
              ? "Signatures use the raw body; never re-serialize JSON."
              : "1. Reproduce with…\n2. Check…\n3. Re-run…"
          }
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {skill && !skill.humanEdited ? (
        <p className="mt-2 text-xs text-muted">
          Once you edit this, distill stops changing it.
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={onDone}
          disabled={pending}
        >
          Cancel
        </button>
        <button type="submit" className={PRIMARY_BUTTON} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

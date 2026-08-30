"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import {
  filterSourceProjects,
  filterThreads,
  MembershipFilterInput,
  MembershipTabBar,
  SourceProjectMembershipList,
  ThreadMembershipList,
  type MembershipTab,
} from "@/components/ProjectMembershipPicker";
import {
  setProjectSourceProjectsAction,
  setProjectThreadsAction,
} from "@/lib/projects/actions";

export type ThreadOption = {
  id: string;
  title: string;
  lastAgentName: string;
  status: string;
  ownerName: string;
  ownerUserId: string;
};

export type SourceProjectOption = {
  id: string;
  name: string;
  providerLabel: string;
  /** Catalog provider id (`chatgpt` / `claude` / `cursor`) for brand icons. */
  provider?: string;
  /** Provider external project id — used to resolve thread source labels. */
  projectId?: string;
  /** Last time Penopta received an update for this catalog row. */
  updatedAt?: string;
  /** False until the source is added to a workgroup (or toggled in Integrations). */
  tracked?: boolean;
  /** Hidden from the Home Untracked list; still listed under Integrations. */
  sidebarHidden?: boolean;
};

/** Dialog to choose source projects and your agent threads for a workgroup. */
export function ProjectMembershipDialog({
  open,
  onClose,
  projectId,
  threads,
  selectedThreadIds,
  sourceProjects,
  selectedSourceProjectIds,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  threads: ThreadOption[];
  selectedThreadIds: string[];
  sourceProjects: SourceProjectOption[];
  selectedSourceProjectIds: string[];
  currentUserId: string;
}) {
  const router = useRouter();
  const myThreads = threads.filter(
    (thread) => thread.ownerUserId === currentUserId,
  );
  const mySelectedIds = selectedThreadIds.filter((id) =>
    myThreads.some((thread) => thread.id === id),
  );
  const [tab, setTab] = useState<MembershipTab>("threads");
  const [filter, setFilter] = useState("");
  const [selectedThreads, setSelectedThreads] = useState<Set<string>>(
    new Set(mySelectedIds),
  );
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    new Set(selectedSourceProjectIds),
  );
  const [pending, startTransition] = useTransition();

  const filteredThreads = filterThreads(myThreads, filter);
  const filteredProjects = filterSourceProjects(sourceProjects, filter);

  function close() {
    if (pending) return;
    onClose();
  }

  function changeTab(next: MembershipTab) {
    setTab(next);
    setFilter("");
  }

  function toggleThread(id: string) {
    setSelectedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSource(id: string) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const [threadsResult, sourcesResult] = await Promise.all([
        setProjectThreadsAction(projectId, Array.from(selectedThreads)),
        setProjectSourceProjectsAction(projectId, Array.from(selectedSources)),
      ]);
      if (!threadsResult.ok) {
        toast.error(threadsResult.error);
        return;
      }
      if (!sourcesResult.ok) {
        toast.error(sourcesResult.error);
        return;
      }
      toast.success("Workgroup updated");
      onClose();
      router.refresh();
    });
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add source projects and threads"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface shadow-xl"
      >
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Add to project
          </h2>
          <p className="mt-1 text-sm text-muted">
            Include whole source projects (new threads stay included) and/or
            pick individual threads. You only see your own; other members manage
            theirs. Everyone sees the mixed set on this project.
          </p>
        </div>

        <div className="shrink-0 space-y-3 px-6 pt-4">
          <MembershipTabBar
            tab={tab}
            onChange={changeTab}
            threadCount={selectedThreads.size}
            projectCount={selectedSources.size}
          />
          <MembershipFilterInput
            value={filter}
            onChange={setFilter}
            placeholder={
              tab === "projects" ? "Filter source projects…" : "Filter threads…"
            }
          />
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          role="tabpanel"
        >
          {tab === "projects" ? (
            <SourceProjectMembershipList
              projects={filteredProjects}
              selected={selectedSources}
              onToggle={toggleSource}
              emptyMessage={
                filter.trim()
                  ? "No source projects match that filter."
                  : "No source projects yet. Sync from Penopta Sync (Mac or Linux) or the hourly skill first."
              }
            />
          ) : (
            <ThreadMembershipList
              threads={filteredThreads}
              selected={selectedThreads}
              onToggle={toggleThread}
              emptyMessage={
                filter.trim()
                  ? "No threads match that filter."
                  : "No agent threads of yours yet. Connect an agent to get started."
              }
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Sidebar control + dialog to choose source projects and your agent threads for a workgroup. */
export function ManageProjectThreads({
  projectId,
  threads,
  selectedThreadIds,
  sourceProjects,
  selectedSourceProjectIds,
  currentUserId,
}: {
  projectId: string;
  threads: ThreadOption[];
  selectedThreadIds: string[];
  sourceProjects: SourceProjectOption[];
  selectedSourceProjectIds: string[];
  currentUserId: string;
}) {
  const myThreads = threads.filter(
    (thread) => thread.ownerUserId === currentUserId,
  );
  const mySelectedIds = selectedThreadIds.filter((id) =>
    myThreads.some((thread) => thread.id === id),
  );
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add source projects and threads"
        title="Add source projects and threads"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-foreground"
      >
        <Plus aria-hidden className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <ProjectMembershipDialog
          open
          onClose={() => setOpen(false)}
          projectId={projectId}
          threads={threads}
          selectedThreadIds={mySelectedIds}
          sourceProjects={sourceProjects}
          selectedSourceProjectIds={selectedSourceProjectIds}
          currentUserId={currentUserId}
        />
      ) : null}
    </>
  );
}

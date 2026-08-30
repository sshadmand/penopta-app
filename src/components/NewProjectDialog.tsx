"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type {
  SourceProjectOption,
  ThreadOption,
} from "@/components/ManageProjectThreads";
import {
  filterSourceProjects,
  filterThreads,
  MembershipFilterInput,
  MembershipTabBar,
  SourceProjectMembershipList,
  ThreadMembershipList,
  type MembershipTab,
} from "@/components/ProjectMembershipPicker";
import { VisibilityField } from "@/components/VisibilityField";
import {
  createProjectAction,
  type ProjectVisibility,
} from "@/lib/projects/actions";

/** Name + tabbed source-project / thread picker for creating a workgroup. */
export function NewProjectDialog({
  open,
  onClose,
  threads,
  sourceProjects = [],
  initialName = "",
  initialSourceProjectIds = [],
  initialTab = "threads",
  lockToSources = false,
}: {
  open: boolean;
  onClose: () => void;
  threads: ThreadOption[];
  sourceProjects?: SourceProjectOption[];
  initialName?: string;
  initialSourceProjectIds?: string[];
  initialTab?: MembershipTab;
  /** Empty-state tracking flow: include these sources only — no search or extra lists. */
  lockToSources?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState<ProjectVisibility>("public");
  const [tab, setTab] = useState<MembershipTab>(initialTab);
  const [filter, setFilter] = useState("");
  const [selectedThreads, setSelectedThreads] = useState<Set<string>>(
    new Set(),
  );
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    () => new Set(initialSourceProjectIds),
  );
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initialName);
      setVisibility("public");
      setTab(initialTab);
      setFilter("");
      setSelectedThreads(new Set());
      setSelectedSources(new Set(initialSourceProjectIds));
    }
  }

  if (!open) return null;

  const filteredThreads = filterThreads(threads, filter);
  const filteredProjects = filterSourceProjects(sourceProjects, filter);

  function close() {
    if (pending) return;
    setName("");
    setVisibility("public");
    setTab("threads");
    setFilter("");
    setSelectedThreads(new Set());
    setSelectedSources(new Set());
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give your workgroup a name.");
      return;
    }
    const sourceIds = lockToSources
      ? initialSourceProjectIds
      : Array.from(selectedSources);
    const threadIds = lockToSources ? [] : Array.from(selectedThreads);
    startTransition(async () => {
      const result = await createProjectAction(
        name,
        threadIds,
        visibility,
        sourceIds,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Workgroup created");
      setName("");
      setVisibility("public");
      setTab("threads");
      setFilter("");
      setSelectedThreads(new Set());
      setSelectedSources(new Set());
      onClose();
      router.push(`/projects/${result.id}`);
    });
  }

  const canCreate = name.trim().length > 0;
  const lockedSources = sourceProjects.filter((project) =>
    initialSourceProjectIds.includes(project.id),
  );

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Start a workgroup"
      onClick={close}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface shadow-xl"
      >
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Start a workgroup
          </h2>
          <p className="mt-1 text-sm text-muted">
            {lockToSources
              ? `Name your workgroup. ${lockedSources[0]?.name ?? "This source"} will be added and tracking will start.`
              : "Name your workgroup. You can include source projects and threads now, or add them later."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <label
            htmlFor="project-name"
            className="block text-sm font-medium text-foreground"
          >
            Workgroup name
          </label>
          <input
            id="project-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q3 Launch"
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent"
          />

          <div className="mt-5">
            <VisibilityField
              value={visibility}
              onChange={setVisibility}
              disabled={pending}
              name="new-project-visibility"
            />
          </div>

          {lockToSources ? (
            <ul className="mt-5 space-y-0.5">
              {lockedSources.map((project) => (
                <li
                  key={project.id}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <p className="truncate text-sm text-foreground">
                    {project.name}
                  </p>
                  {project.providerLabel ? (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {project.providerLabel}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="mt-5 space-y-3">
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
                    tab === "projects"
                      ? "Filter source projects…"
                      : "Filter threads…"
                  }
                />
              </div>

              <div className="mt-3" role="tabpanel">
                {tab === "projects" ? (
                  <>
                    <p className="mb-2 text-xs text-muted">
                      New threads in a selected source project stay included
                      automatically.
                    </p>
                    <SourceProjectMembershipList
                      projects={filteredProjects}
                      selected={selectedSources}
                      onToggle={toggleSource}
                      emptyMessage={
                        filter.trim()
                          ? "No source projects match that filter."
                          : "No source projects yet. Sync from Penopta Sync (Mac or Linux) or the hourly skill first — or use the Threads tab."
                      }
                    />
                  </>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-muted">
                      Optional — add individual threads now, or skip and add
                      them later.
                    </p>
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
                  </>
                )}
              </div>
            </>
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
            type="submit"
            disabled={pending || !canCreate}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create workgroup"}
          </button>
        </div>
      </form>
    </div>
  );
}

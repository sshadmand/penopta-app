"use client";

import { FolderSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { SourceProjectOption } from "@/components/ManageProjectThreads";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import {
  setProviderProjectSidebarHiddenAction,
  setProviderProjectTrackedAction,
} from "@/lib/integrations/actions";
import { addSourceProjectToPenoptaProjectAction } from "@/lib/projects/actions";

type PenoptaProjectOption = { id: string; name: string };

/** Empty state for a discovered source project that is not tracked yet. */
export function StartTrackingEmpty({
  source,
  projects,
}: {
  source: SourceProjectOption;
  projects: PenoptaProjectOption[];
}) {
  const router = useRouter();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function startAdd() {
    if (projects.length === 0) {
      setCreateOpen(true);
      return;
    }
    setChooserOpen(true);
  }

  function addToExisting(projectId: string) {
    startTransition(async () => {
      const result = await addSourceProjectToPenoptaProjectAction(
        projectId,
        source.id,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Tracking started");
      setChooserOpen(false);
      router.push(`/projects/${result.projectId}`);
    });
  }

  function trackWithoutProject() {
    startTransition(async () => {
      const result = await setProviderProjectTrackedAction(
        source.id,
        true,
        source.provider ?? "",
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Tracking started");
      setChooserOpen(false);
      router.push("/");
    });
  }

  function ignoreSource() {
    startTransition(async () => {
      const result = await setProviderProjectSidebarHiddenAction(
        source.id,
        true,
        source.provider,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${source.name} hidden`, {
        description: `If you change your mind go to integrations -> ${source.providerLabel}`,
      });
      router.push("/");
    });
  }

  return (
    <>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface px-8 py-9 text-center shadow-sm">
        <FolderSearch
          aria-hidden
          className="mx-auto h-8 w-8 text-muted"
          strokeWidth={1.5}
        />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Start tracking
        </h1>
        <p className="mt-1 text-sm font-medium text-foreground">
          {source.name}
        </p>
        {source.providerLabel ? (
          <p className="mt-0.5 text-xs text-muted">{source.providerLabel}</p>
        ) : null}
        <p className="mt-3 text-sm leading-relaxed text-muted">
          We found this project but have not started tracking threads or
          reviewing transcripts until you give permission to sync from it.
        </p>
        <button
          type="button"
          onClick={startAdd}
          disabled={pending}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          Add to a project
        </button>
        {projects.length === 0 ? (
          <button
            type="button"
            onClick={trackWithoutProject}
            disabled={pending}
            className="mt-3 text-sm text-muted transition hover:text-foreground disabled:opacity-60"
          >
            Start tracking without project
          </button>
        ) : null}
        <button
          type="button"
          onClick={ignoreSource}
          disabled={pending}
          className="mt-3 text-sm text-muted transition hover:text-foreground disabled:opacity-60"
        >
          Ignore
        </button>
      </div>

      {chooserOpen ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add to a workgroup"
          onClick={() => {
            if (!pending) setChooserOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold tracking-tight">
                Add to a project
              </h2>
              <p className="mt-1 text-sm text-muted">
                Adding {source.name} to a workgroup starts tracking it.
              </p>
            </div>
            <ul className="max-h-64 overflow-y-auto px-3 py-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => addToExisting(project.id)}
                    className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-foreground transition hover:bg-background disabled:opacity-60"
                  >
                    {project.name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setChooserOpen(false);
                  setCreateOpen(true);
                }}
                className="flex h-10 w-full items-center justify-center rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
              >
                Start a new project
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={trackWithoutProject}
                className="flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium text-muted transition hover:bg-background hover:text-foreground disabled:opacity-60"
              >
                Start tracking without project
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <NewProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        threads={[]}
        sourceProjects={[source]}
        initialName={source.name}
        initialSourceProjectIds={[source.id]}
        lockToSources
      />
    </>
  );
}

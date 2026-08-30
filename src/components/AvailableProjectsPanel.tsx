"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { RelativeTime } from "@/components/LocalTime";
import {
  setProviderProjectSidebarHiddenAction,
  setProviderProjectTrackedAction,
} from "@/lib/integrations/actions";
import {
  PROVIDER_PROJECT_SOURCE_LABEL,
  type AvailableProviderProject,
} from "@/lib/integrations/provider-projects-view";

/** List available provider projects with track toggles. */
export function AvailableProjectsPanel({
  providerId,
  projects,
}: {
  providerId: string;
  projects: AvailableProviderProject[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setTracked(id: string, tracked: boolean) {
    startTransition(async () => {
      const result = await setProviderProjectTrackedAction(
        id,
        tracked,
        providerId,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(tracked ? "Tracking enabled" : "Tracking disabled");
      router.refresh();
    });
  }

  function showInSidebar(id: string, name: string) {
    startTransition(async () => {
      const result = await setProviderProjectSidebarHiddenAction(
        id,
        false,
        providerId,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} shown in sidebar`);
      router.refresh();
    });
  }

  return (
    <section className="mt-8 max-w-2xl">
      <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
        Available projects
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Projects show up here from Penopta Sync, Linux host sync, or the hourly
        skill — whichever lands first. Add a source to a workgroup from Home
        (Untracked) to start tracking, or turn tracking on here. The scheduled
        sync then keeps pulling transcripts. Names with a{" "}
        <span className="font-medium text-foreground">P:</span> or{" "}
        <span className="font-medium text-foreground">Private:</span> prefix are
        never imported.
      </p>

      {projects.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-sidebar px-4 py-5 text-sm text-muted">
          No projects yet. Sync from the Mac or Linux Penopta Sync app, or run
          the scheduled skill once — any of those is enough to start.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border border border-border rounded-md">
          {projects.map((project) => {
            const sourceLabel = project.source
              ? PROVIDER_PROJECT_SOURCE_LABEL[project.source]
              : null;
            return (
              <li
                key={project.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {project.name}
                    </p>
                    {project.tracked ? (
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-success">
                        Tracked
                      </span>
                    ) : null}
                    {project.sidebarHidden ? (
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
                        Hidden
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {project.createdAt ? (
                      <RelativeTime at={project.createdAt} prefix="Created" />
                    ) : (
                      "Created time unknown"
                    )}
                    {sourceLabel ? (
                      <>
                        <span className="text-muted"> · </span>
                        via {sourceLabel}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {project.sidebarHidden ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => showInSidebar(project.id, project.name)}
                      className="text-xs text-muted transition hover:text-foreground disabled:opacity-40"
                    >
                      Show in sidebar
                    </button>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm">
                    <span className="sr-only">Track {project.name}</span>
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border text-foreground accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      checked={project.tracked}
                      disabled={pending}
                      onChange={(e) => setTracked(project.id, e.target.checked)}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

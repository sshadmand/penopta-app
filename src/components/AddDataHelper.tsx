"use client";

import { FolderInput } from "lucide-react";
import { useState } from "react";

import {
  ProjectMembershipDialog,
  type SourceProjectOption,
  type ThreadOption,
} from "@/components/ManageProjectThreads";

type PenoptaProjectOption = { id: string; name: string };

const EMPTY_IDS: string[] = [];

/** Empty-state card to add threads and source projects to existing workgroups. */
export function AddDataHelper({
  projects,
  threads,
  sourceProjects = [],
  currentUserId,
}: {
  projects: PenoptaProjectOption[];
  threads: ThreadOption[];
  sourceProjects?: SourceProjectOption[];
  currentUserId: string;
}) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);

  const plural = projects.length === 1 ? "project" : "projects";

  function startAdd() {
    if (projects.length === 1) {
      setTargetProjectId(projects[0].id);
      return;
    }
    setChooserOpen(true);
  }

  function pickProject(id: string) {
    setChooserOpen(false);
    setTargetProjectId(id);
  }

  return (
    <>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface px-8 py-9 text-center shadow-sm">
        <FolderInput
          aria-hidden
          className="mx-auto h-8 w-8 text-muted"
          strokeWidth={1.5}
        />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Add data to your project{projects.length === 1 ? "" : "s"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your {plural} {projects.length === 1 ? "isn't" : "aren't"} tracking
          any threads or source projects yet. Add some so activity shows up
          here.
        </p>
        <button
          type="button"
          onClick={startAdd}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground transition hover:opacity-90"
        >
          Add data
        </button>
      </div>

      {chooserOpen ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a project"
          onClick={() => setChooserOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold tracking-tight">
                Choose a project
              </h2>
              <p className="mt-1 text-sm text-muted">
                Pick which workgroup should get threads and source projects.
              </p>
            </div>
            <ul className="max-h-64 overflow-y-auto px-3 py-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => pickProject(project.id)}
                    className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-foreground transition hover:bg-background"
                  >
                    {project.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {targetProjectId ? (
        <ProjectMembershipDialog
          key={targetProjectId}
          open
          onClose={() => setTargetProjectId(null)}
          projectId={targetProjectId}
          threads={threads}
          selectedThreadIds={EMPTY_IDS}
          sourceProjects={sourceProjects}
          selectedSourceProjectIds={EMPTY_IDS}
          currentUserId={currentUserId}
        />
      ) : null}
    </>
  );
}

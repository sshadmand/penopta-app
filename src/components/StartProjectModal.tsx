"use client";

import { FolderPlus } from "lucide-react";
import { useState } from "react";

import type {
  SourceProjectOption,
  ThreadOption,
} from "@/components/ManageProjectThreads";
import { NewProjectDialog } from "@/components/NewProjectDialog";

/** Empty-state card + dialog for adding a workgroup once agents have data. */
export function StartProjectModal({
  threads,
  sourceProjects = [],
}: {
  threads: ThreadOption[];
  sourceProjects?: SourceProjectOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface px-8 py-9 text-center shadow-sm">
        <FolderPlus
          aria-hidden
          className="mx-auto h-8 w-8 text-muted"
          strokeWidth={1.5}
        />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Create workgroup
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Name a workgroup to organize and share work. You can add source
          projects and agent threads now or later.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground transition hover:opacity-90"
        >
          Create workgroup
        </button>
      </div>

      <NewProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        threads={threads}
        sourceProjects={sourceProjects}
      />
    </>
  );
}

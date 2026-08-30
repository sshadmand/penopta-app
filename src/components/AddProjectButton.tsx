"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import type {
  SourceProjectOption,
  ThreadOption,
} from "@/components/ManageProjectThreads";
import { NewProjectDialog } from "@/components/NewProjectDialog";

/** Sidebar plus control. Opens a name + membership dialog. */
export function AddProjectButton({
  threads,
  sourceProjects = [],
}: {
  threads: ThreadOption[];
  sourceProjects?: SourceProjectOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create a new workgroup"
        title="Create a new workgroup"
        className="grid h-6 w-6 border border-border shrink-0 place-items-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-foreground"
      >
        <Plus aria-hidden className="h-3.5 w-3.5" />
      </button>

      <NewProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        threads={threads}
        sourceProjects={sourceProjects}
      />
    </>
  );
}

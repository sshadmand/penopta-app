"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteProjectAction } from "@/lib/projects/actions";

/** Owner-only control that confirms, then deletes the project. */
export function DeleteProjectButton({
  projectId,
  name,
  variant = "full",
}: {
  projectId: string;
  name: string;
  variant?: "icon" | "full";
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();

  function remove() {
    startDelete(async () => {
      const result = await deleteProjectAction(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Workgroup deleted");
      router.push("/");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Delete workgroup"
        aria-label="Delete workgroup"
        className={
          "inline-flex h-9 w-full items-center justify-center gap-1.5 text-sm  text-danger transition hover:bg-danger/10"
        }
      >
        {variant === "full" ? "Delete workgroup" : null}
      </button>

      {confirming ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Delete workgroup"
          onClick={() => !deleting && setConfirming(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold tracking-tight">
              Delete project
            </h2>
            <p className="mt-1 text-sm text-muted">
              Delete <span className="font-medium text-foreground">{name}</span>
              ? This removes the project and its thread links. Your agent
              threads themselves are not deleted. This can’t be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete workgroup"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

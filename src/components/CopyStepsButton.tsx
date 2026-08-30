"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Strip `**bold**` / `__underline__` markers for a plain clipboard paste. */
function stripStepMarkup(step: string): string {
  return step.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
}

export function formatStepsForCopy(steps: string[]): string {
  return steps
    .map((step, i) => `${i + 1}. ${stripStepMarkup(step)}`)
    .join("\n");
}

export function CopyStepsButton({ steps }: { steps: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatStepsForCopy(steps));
      setCopied(true);
      toast.success("Copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted transition hover:bg-background hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

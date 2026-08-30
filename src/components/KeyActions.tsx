"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  invalidateUserApiKeyAction,
  mintUserApiKeyAction,
  remintUserApiKeyAction,
  type KeyActionState,
} from "@/lib/keys/actions";

type Mode = "mint" | "manage";

export function KeyActions({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(
    action: () => Promise<KeyActionState>,
    successMessage: string,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  if (mode === "mint") {
    return (
      <div>
        <button
          type="button"
          onClick={() => run(mintUserApiKeyAction, "Key minted")}
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Minting…" : "Mint key"}
        </button>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            run(remintUserApiKeyAction, "Key re-minted — update your agent URL")
          }
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Working…" : "Re-mint"}
        </button>
        <button
          type="button"
          onClick={() =>
            run(invalidateUserApiKeyAction, "Key invalidated")
          }
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
        >
          Invalidate
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

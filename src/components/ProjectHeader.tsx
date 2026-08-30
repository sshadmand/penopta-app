"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { renameProjectAction } from "@/lib/projects/actions";

const RENAME_DEBOUNCE_MS = 400;

/** Project detail header with direct name editing for the owner. */
export function ProjectHeader({
  projectId,
  name,
  isOwner = false,
  leading,
  trailing,
}: {
  projectId: string;
  name: string;
  isOwner?: boolean;
  /** Optional control before the title (e.g. mobile nav toggle). */
  leading?: React.ReactNode;
  /** Optional control after the title (e.g. mobile delete). */
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [, startTransition] = useTransition();
  const focusedRef = useRef(false);
  const savedNameRef = useRef(name);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focusedRef.current) {
      setValue(name);
      savedNameRef.current = name;
    }
  }, [name]);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  function persistName(nextName: string) {
    if (nextName === savedNameRef.current) return;
    startTransition(async () => {
      const result = await renameProjectAction(projectId, nextName);
      if (!result.ok) {
        toast.error(result.error);
        setValue(savedNameRef.current);
        return;
      }
      savedNameRef.current = nextName;
      router.refresh();
    });
  }

  function clearDebounce() {
    if (debounceRef.current == null) return;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }

  function schedulePersist(nextName: string) {
    clearDebounce();
    if (!nextName || nextName === savedNameRef.current) return;
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      persistName(nextName);
    }, RENAME_DEBOUNCE_MS);
  }

  function flushPersist() {
    clearDebounce();
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(savedNameRef.current);
      return;
    }
    if (trimmed !== value) setValue(trimmed);
    persistName(trimmed);
  }

  return (
    <header className="flex h-12 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leading}
        {isOwner ? (
          <input
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              setValue(next);
              schedulePersist(next.trim());
            }}
            onFocus={() => {
              focusedRef.current = true;
            }}
            onBlur={() => {
              focusedRef.current = false;
              flushPersist();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                clearDebounce();
                setValue(savedNameRef.current);
                e.currentTarget.blur();
              }
            }}
            maxLength={120}
            aria-label="Workgroup name"
            className="min-w-0 flex-1 bg-transparent text-base font-semibold tracking-tight outline-none placeholder:text-muted disabled:opacity-60"
          />
        ) : (
          <h1 className="truncate text-base font-semibold tracking-tight">
            {name}
          </h1>
        )}
      </div>

      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}

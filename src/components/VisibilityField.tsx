"use client";

import { useState } from "react";

import type { ProjectVisibility } from "@/lib/projects/actions";

const OPTIONS: {
  value: ProjectVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: "public",
    label: "Public",
    description: "Everyone in org can see it.",
  },
  {
    value: "private",
    label: "Private",
    description: "Only visible to you.",
  },
];

function visibilityLabel(value: ProjectVisibility): string {
  return value === "public" ? "Public" : "Private";
}

/**
 * Collapsed “Visibility Public” text; click to expand Public/Private options.
 * Plain text — not link-styled.
 */
export function VisibilityField({
  value,
  onChange,
  editable = true,
  disabled = false,
  name = "project-visibility",
}: {
  value: ProjectVisibility;
  onChange?: (next: ProjectVisibility) => void;
  editable?: boolean;
  disabled?: boolean;
  name?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!editable) {
    return (
      <p className="text-sm text-foreground">
        Visibility: {visibilityLabel(value)}
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={open}
        className="text-sm text-foreground transition hover:opacity-70 disabled:opacity-60"
      >
        Visibility: <b>{visibilityLabel(value)}</b>
      </button>

      {open ? (
        <fieldset disabled={disabled} className="mt-2 space-y-2">
          <legend className="sr-only">Workgroup visibility</legend>
          {OPTIONS.map((option) => {
            const selected = value === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                  selected
                    ? "border-foreground/25 bg-background"
                    : "border-border hover:bg-background"
                } ${disabled ? "opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={selected}
                  onChange={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}

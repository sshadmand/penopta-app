"use client";

import { ChevronDown } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useId, useRef, useState } from "react";

import Anthropic from "@/components/icons/Anthropic";
import OpenAI from "@/components/icons/OpenAI";

export type ChatHelpOption = {
  label: string;
  href: string;
  /** When set, shows the matching brand icon on the row. */
  provider?: "claude" | "chatgpt";
};

const OPTION_ICONS: Record<
  NonNullable<ChatHelpOption["provider"]>,
  ComponentType<{ className?: string }>
> = {
  claude: Anthropic,
  chatgpt: OpenAI,
};

/** “Get help from chat” with a Claude / ChatGPT picker. */
export function ChatHelpMenu({
  options,
  label = "Get help from chat",
}: {
  options: ChatHelpOption[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (options.length === 0) return null;

  return (
    <div ref={rootRef} className="relative text-sm">
      <p className="text-muted">
        Need help?{" "}
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium text-muted transition hover:text-foreground"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          {label}
          <ChevronDown
            className={`size-3.5 transition ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </p>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 z-10 mt-2 min-w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-sm"
        >
          {options.map((option) => {
            const Icon = option.provider ? OPTION_ICONS[option.provider] : null;
            return (
              <a
                key={option.href}
                role="menuitem"
                href={option.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition hover:bg-sidebar"
                onClick={() => setOpen(false)}
              >
                {Icon ? (
                  <span aria-hidden className="inline-flex shrink-0">
                    <Icon className="size-3.5 fill-current!" />
                  </span>
                ) : null}
                {option.label}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { Check, Copy, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import Anthropic from "@/components/icons/Anthropic";
import OpenAI from "@/components/icons/OpenAI";

function runPrompt(command: string): string {
  return `Run ${command} tool`;
}

function claudeRunHref(command: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(runPrompt(command))}`;
}

function chatgptRunHref(command: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(runPrompt(command))}`;
}

/**
 * Hover play control next to an MCP command name. Opens Run in Claude /
 * ChatGPT and Copy command.
 */
export function McpCommandPlayMenu({ command }: { command: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Copied");
      window.setTimeout(() => setCopied(false), 1500);
      setOpen(false);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        className={`grid size-6 place-items-center rounded-md text-muted transition hover:bg-sidebar hover:text-foreground focus-visible:bg-sidebar focus-visible:text-foreground ${
          open
            ? "bg-sidebar text-foreground opacity-100"
            : "opacity-100 md:opacity-0 md:group-hover/cmd:opacity-100 md:group-focus-within/cmd:opacity-100 focus-visible:opacity-100"
        }`}
        aria-label={`Run or copy ${command}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <Play className="size-3.5 fill-current" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute top-full left-0 z-20 mt-1 min-w-50 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-sm"
        >
          <a
            role="menuitem"
            href={claudeRunHref(command)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition hover:bg-sidebar"
            onClick={() => setOpen(false)}
          >
            <Anthropic
              className="size-3.5 shrink-0 fill-current!"
              aria-hidden
            />
            Run in Claude
          </a>
          <a
            role="menuitem"
            href={chatgptRunHref(command)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition hover:bg-sidebar"
            onClick={() => setOpen(false)}
          >
            <OpenAI className="size-3.5 shrink-0 fill-current!" aria-hidden />
            Run in ChatGPT
          </a>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition hover:bg-sidebar"
            onClick={copyCommand}
          >
            {copied ? (
              <Check
                className="size-3.5 shrink-0 text-success"
                aria-hidden
              />
            ) : (
              <Copy className="size-3.5 shrink-0" aria-hidden />
            )}
            Copy command
          </button>
        </div>
      ) : null}
    </div>
  );
}

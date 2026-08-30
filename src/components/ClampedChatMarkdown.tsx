"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { ChatMarkdown } from "@/components/ChatMarkdown";

/** Collapse summary markdown past this many lines. */
const SUMMARY_CLAMP_LINES = 7;

/** Markdown that clamps to a few lines, optionally with Show more / Show less. */
export function ClampedChatMarkdown({
  children,
  maxLines = SUMMARY_CLAMP_LINES,
  expandable = true,
}: {
  children: string;
  maxLines?: number;
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
    const cap =
      (Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 22) *
      maxLines;
    setNeedsClamp(node.scrollHeight > cap + 1);
  }, [children, maxLines]);

  const collapsed = expandable ? needsClamp && !expanded : !expanded;

  return (
    <div>
      <div
        className={`text-sm leading-relaxed${
          collapsed ? " overflow-hidden" : ""
        }`}
        style={
          collapsed ? { maxHeight: `calc(1.625em * ${maxLines})` } : undefined
        }
      >
        <div ref={contentRef}>
          <ChatMarkdown>{children}</ChatMarkdown>
        </div>
      </div>
      {expandable && needsClamp ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mt-1.5 text-xs font-medium text-muted transition hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

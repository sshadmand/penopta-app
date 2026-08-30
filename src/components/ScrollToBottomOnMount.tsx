"use client";

import { useLayoutEffect, useRef } from "react";

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Sentinel that jumps the nearest overflow scroll parent to the bottom on mount
 * (and whenever `triggerKey` changes). Instant — no smooth animation.
 */
export function ScrollToBottomOnMount({ triggerKey }: { triggerKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = findScrollParent(el);
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    el.scrollIntoView({ block: "end" });
  }, [triggerKey]);

  return <div ref={ref} aria-hidden className="h-[30vh] w-full shrink-0" />;
}

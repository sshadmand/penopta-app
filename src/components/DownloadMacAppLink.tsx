"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore, type MouseEvent } from "react";

import Apple from "@/components/icons/Apple";
import { integrationPath } from "@/lib/integrations/paths";

const MACOS_HREF = integrationPath("macos");
const DISMISS_KEY = "penopta.sidebar.download-mac-app.dismissed";

const dismissListeners = new Set<() => void>();

function subscribeToDismiss(onStoreChange: () => void) {
  dismissListeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    dismissListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function isDismissed() {
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}

function persistDismissed() {
  window.localStorage.setItem(DISMISS_KEY, "1");
  for (const listener of dismissListeners) listener();
}

export function DownloadMacAppLink({
  className,
  active = false,
  onClick,
}: {
  className?: string;
  active?: boolean;
  showArrow?: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive = active || pathname === MACOS_HREF;
  const dismissed = useSyncExternalStore(
    subscribeToDismiss,
    isDismissed,
    () => false,
  );

  const dismiss = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    persistDismissed();
  }, []);

  if (dismissed) return null;

  return (
    <div className={`relative ${className ?? ""}`}>
      <Link
        href={MACOS_HREF}
        aria-current={isActive ? "page" : undefined}
        onClick={onClick}
        className={`mac-app-download group flex w-full justify-between rounded-md border border-border bg-surface px-4 py-3 pr-8 text-sm font-medium text-foreground transition hover:bg-background ${
          isActive ? "bg-background" : ""
        }`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Apple className="size-4" />
            <span>Get Mac app</span>
          </div>
          <p className="text-xs font-normal text-muted">
            Keep your skills synced between projects and peers on your desktop.
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss Mac app download"
        className="absolute top-1.5 right-1.5 z-10 inline-flex size-6 items-center justify-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-foreground"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

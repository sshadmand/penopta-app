"use client";

import { Menu, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const ProjectSidebarContext = createContext<{
  open: () => void;
  close: () => void;
} | null>(null);

/** Menu control for the header — only visible below md when the rail is a drawer. */
export function ProjectSidebarToggle() {
  const ctx = useContext(ProjectSidebarContext);
  if (!ctx) return null;

  return (
    <button
      type="button"
      onClick={ctx.open}
      aria-label="Open navigation"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-background md:hidden"
    >
      <Menu aria-hidden className="h-4 w-4" />
    </button>
  );
}

/**
 * Project left rail: fixed column from md up; below md it slides in as a drawer
 * (right details panel already hides below lg).
 */
export function ProjectSidebarFrame({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const openNav = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    function sync() {
      setIsMobile(mq.matches);
      if (!mq.matches) setOpen(false);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const drawerHidden = isMobile && !open;

  return (
    <ProjectSidebarContext.Provider value={{ open: openNav, close }}>
      <div className="flex h-dvh overflow-hidden bg-background">
        {open ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={close}
          />
        ) : null}

        <aside
          id="project-nav"
          aria-hidden={drawerHidden || undefined}
          // Transform only on mobile: any translate (even translate-x-0) creates a
          // containing block that traps position:fixed dialogs inside the rail.
          className={`fixed inset-y-0 left-0 z-50 flex h-full w-56 flex-col border-r border-border bg-sidebar md:static md:z-auto md:shrink-0 ${
            isMobile
              ? `transition-transform duration-200 ease-out ${
                  open
                    ? "translate-x-0"
                    : "-translate-x-full pointer-events-none"
                }`
              : ""
          }`}
          onClick={(e) => {
            // Close after navigating via a link inside the drawer.
            if (isMobile && (e.target as HTMLElement).closest("a[href]")) {
              close();
            }
          }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close navigation"
            className="absolute top-3.5 right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-foreground/5 hover:text-foreground md:hidden"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
          {sidebar}
        </aside>

        {children}
      </div>
    </ProjectSidebarContext.Provider>
  );
}

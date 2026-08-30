import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AddProjectButton } from "@/components/AddProjectButton";
import { BrandLogo } from "@/components/Brand";
import { DownloadMacAppLink } from "@/components/DownloadMacAppLink";
import {
  ProjectSidebarFrame,
  ProjectSidebarToggle,
} from "@/components/ProjectSidebarFrame";
import {
  WorkspaceAppFrame,
  WorkspaceSidebarChrome,
  type WorkspaceNavId,
} from "@/components/WorkspaceShell";

function Pulse({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-skeleton ${className}`} />
  );
}

function LoadingStatus({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

/** Settings main column while a page's body is still loading. */
export function SettingsBodyFallback() {
  return (
    <div className="mt-8">
      <LoadingStatus label="Loading" />
      <Pulse className="h-64 w-full rounded-xl" />
    </div>
  );
}

/** Generic settings content: used by `settings/loading.tsx`. */
export function SettingsContentFallback() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-10 sm:px-12">
      <LoadingStatus label="Loading" />
      <Pulse className="h-8 w-32" />
      <Pulse className="mt-2 h-4 w-72" />
      <Pulse className="mt-8 h-64 w-full rounded-xl" />
    </main>
  );
}

export function IntegrationsGridFallback() {
  return (
    <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <Pulse key={i} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}

export function IntegrationDetailFallback() {
  return (
    <main className="mx-auto max-w-2xl px-8 py-10 sm:px-12">
      <LoadingStatus label="Loading" />
      <Pulse className="h-4 w-28" />
      <div className="mt-6 flex items-center gap-3">
        <Pulse className="size-10 rounded-full" />
        <div>
          <Pulse className="h-8 w-40" />
          <Pulse className="mt-1 h-4 w-56" />
        </div>
      </div>
      <Pulse className="mt-8 h-64 w-full rounded-xl" />
    </main>
  );
}

function WorkgroupsListSkeleton() {
  return (
    <ul className="-mx-1 mt-4 space-y-4" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i}>
          <Pulse
            className={`h-4 rounded-md ${i % 3 === 0 ? "w-4/5" : "w-full"}`}
          />
        </li>
      ))}
    </ul>
  );
}

function OrgSwitcherSkeleton() {
  return (
    <div className="shrink-0 border-t border-border px-4 py-4">
      <Pulse className="mt-2 h-5 w-28" />
    </div>
  );
}

/** Workspace rail while org-owned lists are still loading. Static chrome is real. */
export function WorkspaceChromeFallback({
  children,
  activeNav,
}: {
  children?: ReactNode;
  activeNav?: WorkspaceNavId;
}) {
  return (
    <WorkspaceAppFrame
      sidebar={
        <WorkspaceSidebarChrome
          activeNav={activeNav}
          addProject={<AddProjectButton threads={[]} />}
          workgroups={<WorkgroupsListSkeleton />}
          footer={<OrgSwitcherSkeleton />}
        />
      }
    >
      <LoadingStatus label="Loading" />
      {children ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <Pulse className="h-full min-h-64 w-full rounded-xl" />
        </div>
      )}
    </WorkspaceAppFrame>
  );
}

/** Project page chrome while project data is still loading. */
export function ProjectChromeFallback() {
  return (
    <ProjectSidebarFrame
      sidebar={
        <>
          <div className="shrink-0 border-b border-border py-4 pr-12 pl-4 md:px-4">
            <Link href="/">
              <BrandLogo className="h-7" />
            </Link>
          </div>
          <div className="shrink-0 px-3 pt-3">
            <Link
              href="/"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition hover:bg-background"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Back
            </Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
            <span className="-mx-1 mb-3 block shrink-0 truncate rounded-md bg-foreground/10 px-2 py-1.5 text-sm font-medium text-foreground">
              Workgroup home
            </span>
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              Agent Threads
            </p>
            <div className="mt-2 space-y-0.5" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <Pulse
                  key={i}
                  className={`h-8 rounded-md ${i % 3 === 0 ? "w-4/5" : "w-full"}`}
                />
              ))}
            </div>
            <div className="mt-auto shrink-0 pb-4">
              <DownloadMacAppLink />
            </div>
          </div>
          <OrgSwitcherSkeleton />
        </>
      }
    >
      <LoadingStatus label="Loading project" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <ProjectSidebarToggle />
          <Pulse className="h-5 w-40" />
        </header>
        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <Pulse className="h-full min-h-64 w-full rounded-xl" />
        </div>
      </div>
    </ProjectSidebarFrame>
  );
}

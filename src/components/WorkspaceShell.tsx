import {
  Bot,
  ChartNoAxesColumn,
  House,
  Newspaper,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AddProjectButton } from "@/components/AddProjectButton";
import { BrandLogo } from "@/components/Brand";
import { DownloadMacAppLink } from "@/components/DownloadMacAppLink";
import type { SourceProjectOption } from "@/components/ManageProjectThreads";
import { OrgSwitcher, type OrgSwitcherItem } from "@/components/OrgSwitcher";
import { PendingNavLink } from "@/components/PendingNavLink";
import {
  WorkspaceSidebarFrame,
  WorkspaceSidebarToggle,
} from "@/components/WorkspaceSidebarFrame";
import type { SessionUser } from "@/lib/auth/session";
import type { AgentThreadRow, ProjectRow } from "@/lib/db/schema";

type SidebarThread = Pick<
  AgentThreadRow,
  | "id"
  | "title"
  | "status"
  | "lastAgentName"
  | "ownerUserId"
  | "projectContext"
  | "threadUpdatedAt"
  | "lastSyncedAt"
  | "sourceActivity"
>;

type SidebarProject = Pick<ProjectRow, "id" | "name">;

export type WorkspaceNavId = "home" | "analytics" | "feed" | "updates";

const NAV_IDLE =
  "-mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition hover:bg-foreground/5";
const NAV_ACTIVE =
  "-mx-1 flex items-center gap-2 rounded-md bg-foreground/10 px-2 py-1.5 text-sm font-medium text-foreground";
const NAV_IDLE_SPACED =
  "-mx-1 mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition hover:bg-foreground/5";
const NAV_ACTIVE_SPACED =
  "-mx-1 mt-1 flex items-center gap-2 rounded-md bg-foreground/10 px-2 py-1.5 text-sm font-medium text-foreground";

function WorkspaceNavLink({
  href,
  active,
  icon: Icon,
  spaced,
  children,
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  spaced?: boolean;
  children: ReactNode;
}) {
  return (
    <PendingNavLink
      href={href}
      active={active}
      aria-current={active ? "page" : undefined}
      className={spaced ? NAV_IDLE_SPACED : NAV_IDLE}
      activeClassName={spaced ? NAV_ACTIVE_SPACED : NAV_ACTIVE}
    >
      <Icon aria-hidden className="h-4 w-4 shrink-0" />
      {children}
    </PendingNavLink>
  );
}

/** Logo, primary nav, then workgroups header (+ add) + list + footer slots. */
export function WorkspaceSidebarChrome({
  activeNav,
  addProject,
  workgroups,
  footer,
}: {
  activeNav?: WorkspaceNavId;
  addProject: ReactNode;
  workgroups?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="shrink-0 border-b border-border py-2.5 pr-12 pl-4 md:px-4">
        <Link href="/">
          <BrandLogo className="h-6" />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
        <div className="mb-5 shrink-0">
          <WorkspaceNavLink
            href="/"
            active={activeNav === "home"}
            icon={House}
          >
            Home
          </WorkspaceNavLink>
          <WorkspaceNavLink
            href="/analytics"
            active={activeNav === "analytics"}
            icon={ChartNoAxesColumn}
            spaced
          >
            Analytics
          </WorkspaceNavLink>
          <WorkspaceNavLink
            href="/feed"
            active={activeNav === "feed"}
            icon={Bot}
            spaced
          >
            Agent feed
          </WorkspaceNavLink>
          <WorkspaceNavLink
            href="/updates"
            active={activeNav === "updates"}
            icon={Newspaper}
            spaced
          >
            Workgroup Updates
          </WorkspaceNavLink>
        </div>

        <div className="mb-5 min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              Workgroups
            </p>
            {addProject}
          </div>
          {workgroups}
        </div>

        <div className="mt-auto shrink-0 pb-4">
          <DownloadMacAppLink />
        </div>
      </div>

      {footer}
    </>
  );
}

/** Drawer/rail + mobile header; main column is `children`. */
export function WorkspaceAppFrame({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <WorkspaceSidebarFrame sidebar={sidebar}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:hidden">
          <WorkspaceSidebarToggle />
          <Link href="/">
            <BrandLogo className="h-6" />
          </Link>
        </header>
        {children}
      </div>
    </WorkspaceSidebarFrame>
  );
}

/** Shared workspace chrome: left sidebar (workgroups + threads) + header + main content. */
export function WorkspaceShell({
  user,
  orgs = [],
  activeOrgId,
  threads,
  projects = [],
  sourceProjects = [],
  ownerNames = {},
  activeProjectId,
  homeActive = false,
  agentWorkActive = false,
  analyticsActive = false,
  workgroupUpdatesActive = false,
  children,
}: {
  user: SessionUser;
  orgs?: OrgSwitcherItem[];
  activeOrgId?: string;
  threads: SidebarThread[];
  projects?: SidebarProject[];
  sourceProjects?: SourceProjectOption[];
  /** Map of ownerUserId → display name; falls back to the id when missing. */
  ownerNames?: Record<string, string>;
  activeProjectId?: string;
  homeActive?: boolean;
  agentWorkActive?: boolean;
  analyticsActive?: boolean;
  workgroupUpdatesActive?: boolean;
  children: ReactNode;
}) {
  const activeNav: WorkspaceNavId | undefined = homeActive
    ? "home"
    : analyticsActive
      ? "analytics"
      : agentWorkActive
        ? "feed"
        : workgroupUpdatesActive
          ? "updates"
          : undefined;

  return (
    <WorkspaceAppFrame
      sidebar={
        <WorkspaceSidebarChrome
          activeNav={activeNav}
          addProject={
            <AddProjectButton
              sourceProjects={sourceProjects}
              threads={threads
                .filter((thread) => thread.ownerUserId === user.id)
                .map((thread) => ({
                  id: thread.id,
                  title: thread.title,
                  lastAgentName: thread.lastAgentName,
                  status: thread.status,
                  ownerName:
                    ownerNames[thread.ownerUserId] ?? thread.ownerUserId,
                  ownerUserId: thread.ownerUserId,
                }))}
            />
          }
          workgroups={
            projects.length > 0 ? (
              <ul className="-mx-1 mt-2 space-y-0.5">
                {projects.map((project) => {
                  const active = project.id === activeProjectId;
                  return (
                    <li key={project.id}>
                      <PendingNavLink
                        href={`/projects/${project.id}`}
                        active={active}
                        aria-current={active ? "page" : undefined}
                        className="block truncate rounded-md px-2 py-1.5 text-sm text-foreground transition hover:bg-foreground/5"
                        activeClassName="block truncate rounded-md bg-foreground/10 px-2 py-1.5 text-sm font-medium text-foreground"
                        title={project.name}
                      >
                        {project.name}
                      </PendingNavLink>
                    </li>
                  );
                })}
              </ul>
            ) : null
          }
          footer={
            activeOrgId ? (
              <div className="shrink-0 border-t border-border px-4 py-4">
                <OrgSwitcher
                  activeOrgId={activeOrgId}
                  orgs={orgs}
                  userEmail={user.email}
                />
              </div>
            ) : null
          }
        />
      }
    >
      {children}
    </WorkspaceAppFrame>
  );
}

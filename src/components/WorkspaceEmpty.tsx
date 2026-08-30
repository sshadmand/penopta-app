import type { SourceProjectOption } from "@/components/ManageProjectThreads";
import type { OrgSwitcherItem } from "@/components/OrgSwitcher";
import { StartProjectModal } from "@/components/StartProjectModal";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import type { SessionUser } from "@/lib/auth/session";
import type { AgentThreadRow, ProjectRow } from "@/lib/db/schema";

/** Logged-in workspace landing — prompt to add a project once agents have data. */
export function WorkspaceEmpty({
  user,
  orgs = [],
  activeOrgId,
  threads = [],
  projects = [],
  sourceProjects = [],
  ownerNames = {},
}: {
  user: SessionUser;
  orgs?: OrgSwitcherItem[];
  activeOrgId?: string;
  threads?: AgentThreadRow[];
  projects?: ProjectRow[];
  sourceProjects?: SourceProjectOption[];
  ownerNames?: Record<string, string>;
}) {
  const threadOptions = threads
    .filter((thread) => thread.ownerUserId === user.id)
    .map((thread) => ({
      id: thread.id,
      title: thread.title,
      lastAgentName: thread.lastAgentName,
      status: thread.status,
      ownerName: ownerNames[thread.ownerUserId] ?? thread.ownerUserId,
      ownerUserId: thread.ownerUserId,
    }));

  return (
    <WorkspaceShell
      user={user}
      orgs={orgs}
      activeOrgId={activeOrgId}
      threads={threads}
      projects={projects}
      sourceProjects={sourceProjects}
      ownerNames={ownerNames}
      workgroupUpdatesActive
    >
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
        <StartProjectModal
          threads={threadOptions}
          sourceProjects={sourceProjects}
        />
      </main>
    </WorkspaceShell>
  );
}

import { formatDistanceToNow } from "date-fns";

import { AgentBrandIcon } from "@/components/AgentBrandIcon";

function firstName(name: string): string {
  const base = name.trim() || "?";
  return base.split(/\s+/).at(0) || "?";
}

/** Compact thread subtitle: agent icon, owner avatar, source project, sync age. */
export function ThreadHeaderMeta({
  agentName,
  ownerName,
  projectLabel,
  lastSyncedAt,
}: {
  agentName: string;
  ownerName: string;
  projectLabel?: string | null;
  lastSyncedAt: Date;
}) {
  const syncedLabel = formatDistanceToNow(lastSyncedAt, { addSuffix: true });

  return (
    <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted">
      <span title={ownerName}>{firstName(ownerName)}</span>
      {projectLabel ? (
        <span className="min-w-0 truncate" title="Source project">
          in {projectLabel}
        </span>
      ) : null}
      <span className="shrink-0" title={`Synced ${syncedLabel}`}>
        {syncedLabel}
      </span>
      <AgentBrandIcon
        agentName={agentName}
        className="size-3 shrink-0 opacity-50 ml-1"
      />
    </div>
  );
}

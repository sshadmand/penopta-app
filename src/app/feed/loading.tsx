import { AgentWorkListFallback } from "@/components/AgentWorkList";
import { WorkspaceChromeFallback } from "@/components/RouteFallback";

export default function FeedLoading() {
  return (
    <WorkspaceChromeFallback activeNav="feed">
      <AgentWorkListFallback />
    </WorkspaceChromeFallback>
  );
}

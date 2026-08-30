import { HomeSummariesThreadFallback } from "@/components/HomeSummariesThread";
import { WorkspaceChromeFallback } from "@/components/RouteFallback";

export default function UpdatesLoading() {
  return (
    <WorkspaceChromeFallback activeNav="updates">
      <HomeSummariesThreadFallback />
    </WorkspaceChromeFallback>
  );
}

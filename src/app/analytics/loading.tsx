import { WorkspaceChromeFallback } from "@/components/RouteFallback";
import { AnalyticsFallback } from "@/components/StatsFallback";

export default function AnalyticsLoading() {
  return (
    <WorkspaceChromeFallback activeNav="analytics">
      <AnalyticsFallback />
    </WorkspaceChromeFallback>
  );
}

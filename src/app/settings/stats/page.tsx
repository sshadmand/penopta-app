import { redirect } from "next/navigation";

/** Legacy stats URL. Analytics now lives in the workspace navigation. */
export default async function SettingsStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: projectParam } = await searchParams;
  redirect(
    projectParam
      ? `/analytics?project=${encodeURIComponent(projectParam)}`
      : "/analytics",
  );
}

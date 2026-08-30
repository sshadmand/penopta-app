import Link from "next/link";

import { listVisibleProjects } from "@/lib/projects/data";

export async function ProjectList({
  orgId,
  viewerUserId,
  query,
}: {
  orgId: string;
  viewerUserId: string;
  query?: string;
}) {
  const rows = await listVisibleProjects({ orgId, viewerUserId, query });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        {query
          ? "No workgroups match that search."
          : "No workgroups yet. Seed the database with `npm run db:seed`."}
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="block rounded-xl border border-border bg-surface p-4 transition hover:border-foreground/20"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-medium tracking-tight text-foreground">
                {project.name}
              </h2>
              <span className="shrink-0 rounded-md bg-skeleton px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                {project.visibility}
              </span>
            </div>
            {project.summary ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted">
                {project.summary}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

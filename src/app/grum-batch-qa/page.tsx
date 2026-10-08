import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";

const ROUTE = "/grum-batch-qa";

/**
 * An intentionally unlinked, authenticated visual target for Grum's
 * production batch-capture QA. Keep the button visually distinct so a scan
 * can produce a stable review item without touching workspace data.
 */
export default async function GrumBatchQaPage() {
  const session = await getSession();

  if (!session) {
    redirect(loginStartHref(ROUTE));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          Visual QA target
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Batch capture check
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          This page is intentionally reachable only by its direct URL. The
          button below is a stable target for capture review.
        </p>
        <button
          type="button"
          className="mt-8 w-full rounded-lg bg-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-fuchsia-700 focus-visible:ring-2 focus-visible:ring-fuchsia-600 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Capture this QA button
        </button>
      </section>
    </main>
  );
}

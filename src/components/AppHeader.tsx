import Link from "next/link";

import { BrandHomeLink } from "@/components/Brand";
import { ThemeCycleButton } from "@/components/ThemeToggle";
import { loginStartHref } from "@/lib/auth/urls";
import type { SessionUser } from "@/lib/auth/session";

function initials(user: SessionUser): string {
  const base = user.name || user.email || "?";
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function AppHeader({
  user,
  returnTo,
}: {
  user?: SessionUser | null;
  returnTo?: string;
}) {
  const signInHref = loginStartHref(returnTo ?? "/");

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <BrandHomeLink />

        <div className="ml-auto flex min-w-0 items-center gap-3">
          <ThemeCycleButton className="max-sm:hidden" />
          {user ? (
            <div className="flex items-center gap-2">
              <span
                title={user.email}
                className="grid h-8 w-8 place-items-center rounded-full bg-skeleton text-xs font-semibold text-foreground"
              >
                {initials(user)}
              </span>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-foreground transition hover:bg-background"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href={signInHref}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

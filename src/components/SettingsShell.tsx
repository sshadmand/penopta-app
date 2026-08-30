"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/Brand";
import {
  WorkspaceSidebarFrame,
  WorkspaceSidebarToggle,
} from "@/components/WorkspaceSidebarFrame";
import type { IntegrationNavGroup } from "@/lib/integrations/nav";

const NAV: { href: string; label: string; exact?: boolean }[] = [
  { href: "/settings", label: "Account", exact: true },
  { href: "/settings/organization", label: "Organization" },
];

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navClass(active: boolean) {
  return `block rounded-md px-2 py-1.5 text-sm transition ${
    active
      ? "bg-foreground/10 font-medium text-foreground"
      : "text-muted hover:text-foreground"
  }`;
}

function SettingsNavLabel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();
  return <span className={navClass(active || pending)}>{children}</span>;
}

function BackNavLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "opacity-60" : undefined}>{children}</span>;
}

/** Settings chrome: back to the workspace plus account and setup sections. */
export function SettingsShell({
  children,
  integrationNav = [],
}: {
  children: ReactNode;
  integrationNav?: IntegrationNavGroup[];
}) {
  const pathname = usePathname();
  return (
    <WorkspaceSidebarFrame
      sidebar={
        <>
          <div className="shrink-0 border-b border-border py-4 pr-12 pl-4 md:px-4">
            <BrandLogo className="h-7" />
          </div>

          <div className="shrink-0 px-3 pt-3">
            <Link
              href="/"
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition hover:bg-background"
            >
              <BackNavLabel>← Back</BackNavLabel>
            </Link>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              Account and Settings
            </p>
            <ul className="mt-2 space-y-0.5">
              {NAV.map((item) => {
                const active = navActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                    >
                      <SettingsNavLabel active={active}>
                        {item.label}
                      </SettingsNavLabel>
                    </Link>
                  </li>
                );
              })}
              {integrationNav.map((group) => (
                <li key={group.id} className="mt-4">
                  <Link
                    href={group.href}
                    aria-current={pathname === group.href ? "page" : undefined}
                    className={`block px-2 text-xs font-semibold tracking-wider uppercase transition ${
                      pathname === group.href
                        ? "text-foreground"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {group.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      }
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 md:hidden">
          <WorkspaceSidebarToggle />
          <span className="truncate text-sm font-medium text-foreground">
            Settings
          </span>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </WorkspaceSidebarFrame>
  );
}

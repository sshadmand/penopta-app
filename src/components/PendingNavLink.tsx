"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Must render as a descendant of `Link` — selected styles apply while navigating. */
export function PendingActiveLabel({
  active,
  className,
  activeClassName,
  children,
}: {
  active: boolean;
  className: string;
  activeClassName: string;
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();
  return (
    <span className={active || pending ? activeClassName : className}>
      {children}
    </span>
  );
}

type PendingNavLinkProps = ComponentProps<typeof Link> & {
  active?: boolean;
  activeClassName: string;
};

/** `Link` that looks selected as soon as it's clicked. */
export function PendingNavLink({
  children,
  className,
  active = false,
  activeClassName,
  ...props
}: PendingNavLinkProps) {
  return (
    <Link {...props}>
      <PendingActiveLabel
        active={active}
        className={className ?? ""}
        activeClassName={activeClassName}
      >
        {children}
      </PendingActiveLabel>
    </Link>
  );
}

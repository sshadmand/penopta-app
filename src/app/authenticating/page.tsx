import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";

/** Legacy sign-in interstitial — forwards to Better Auth sign-in on `/`. */
export default async function AuthenticatingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await getSession();
  const { returnTo } = await searchParams;
  if (session) {
    const safe =
      returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : "/";
    redirect(safe);
  }
  redirect(loginStartHref(returnTo));
}

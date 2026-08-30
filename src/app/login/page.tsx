import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/server";

/**
 * Auth error landing. Happy-path sign-in is `/` — this route only exists so
 * callback failures can deep-link with `?error=` without losing the message
 * when we later redirect into the home sign-in card.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { error, returnTo } = await searchParams;
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (returnTo) params.set("returnTo", returnTo);
  const qs = params.toString();
  redirect(qs ? `/?${qs}` : "/");
}

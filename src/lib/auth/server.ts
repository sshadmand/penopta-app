import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth/auth";
import type { Session } from "@/lib/auth/session";

/** Read the Better Auth session inside a Server Component / route handler. */
export const getSession = cache(
  async function getSession(): Promise<Session | null> {
    const result = await auth.api.getSession({
      headers: await headers(),
    });
    if (!result?.user?.id || !result.user.email) return null;

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name ?? null,
        image: result.user.image ?? null,
      },
    };
  },
);

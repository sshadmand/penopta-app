"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/server";
import { integrationPath } from "@/lib/integrations/paths";
import {
  setProviderProjectSidebarHidden,
  setProviderProjectTracked,
} from "@/lib/integrations/provider-projects-data";
import { resolveActiveOrg } from "@/lib/orgs/data";

export type SetTrackedState =
  { ok: true; tracked: boolean } | { ok: false; error: string };

/** Toggle whether an available provider project is tracked for sync. */
export async function setProviderProjectTrackedAction(
  id: string,
  tracked: boolean,
  providerId: string,
): Promise<SetTrackedState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to update tracking." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const result = await setProviderProjectTracked(activeOrg.id, id, tracked);
    if (!result.ok) return result;

    revalidatePath(integrationPath(providerId));
    revalidatePath("/");
    revalidatePath(`/sources/${id}`);
    return { ok: true, tracked: result.project.tracked };
  } catch (err) {
    console.error("setProviderProjectTrackedAction", err);
    return { ok: false, error: "Couldn't update tracking. Try again." };
  }
}

export type SetSidebarHiddenState =
  { ok: true; sidebarHidden: boolean } | { ok: false; error: string };

/** Hide or restore an available provider project in the Home Untracked list. */
export async function setProviderProjectSidebarHiddenAction(
  id: string,
  hidden: boolean,
  providerId?: string,
): Promise<SetSidebarHiddenState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to update this project." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const result = await setProviderProjectSidebarHidden(
      activeOrg.id,
      session.user.id,
      id,
      hidden,
    );
    if (!result.ok) return result;

    const provider = providerId ?? result.project.provider;
    revalidatePath(integrationPath(provider));
    revalidatePath("/");
    revalidatePath(`/sources/${id}`);
    return { ok: true, sidebarHidden: result.project.sidebarHidden };
  } catch (err) {
    console.error("setProviderProjectSidebarHiddenAction", err);
    return { ok: false, error: "Couldn't update this project. Try again." };
  }
}

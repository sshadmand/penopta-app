"use server";

import { revalidatePath } from "next/cache";

import {
  deleteOrgLlmCredential,
  upsertOrgLlmCredential,
} from "@/lib/ai/credentials";
import { setOrgDailySummaryEnabled } from "@/lib/ai/daily-summary";
import {
  runWeeklyOrgDigests,
  setOrgWeeklyDigestEnabled,
} from "@/lib/ai/weekly-digest";
import { validateLlmApiKey } from "@/lib/ai/validate-key";
import { getSession } from "@/lib/auth/server";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/db/schema";
import { INTEGRATIONS_PATH, integrationPath } from "@/lib/integrations/paths";
import { resolveActiveOrg } from "@/lib/orgs/data";

export type LlmCredentialActionState =
  { ok: true } | { ok: false; error: string };

function isLlmProvider(value: string): value is LlmProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}

function revalidateAiSettings() {
  revalidatePath(INTEGRATIONS_PATH, "layout");
  revalidatePath(integrationPath("ai"));
}

/** Save or replace an org BYOK key (owners only). */
export async function saveOrgLlmCredentialAction(input: {
  provider: string;
  apiKey: string;
  model?: string;
}): Promise<LlmCredentialActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to save a key." };

  if (!isLlmProvider(input.provider)) {
    return { ok: false, error: "Unknown provider." };
  }
  const apiKey = input.apiKey.trim();
  if (!apiKey) return { ok: false, error: "Paste an API key first." };

  try {
    const { activeOrg, role } = await resolveActiveOrg(session.user.id);
    if (role !== "owner") {
      return {
        ok: false,
        error: "Only organization owners can manage AI provider keys.",
      };
    }

    const check = await validateLlmApiKey({
      provider: input.provider,
      apiKey,
      model: input.model ?? null,
    });
    if (!check.ok) return { ok: false, error: check.error };

    await upsertOrgLlmCredential({
      orgId: activeOrg.id,
      provider: input.provider,
      apiKey,
      model: input.model ?? null,
      createdByUserId: session.user.id,
    });
    revalidateAiSettings();
    return { ok: true };
  } catch (err) {
    console.error("saveOrgLlmCredentialAction", err);
    return { ok: false, error: "Couldn't save the key. Try again." };
  }
}

/** Remove an org BYOK key (owners only). */
export async function deleteOrgLlmCredentialAction(input: {
  provider: string;
}): Promise<LlmCredentialActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to remove a key." };

  if (!isLlmProvider(input.provider)) {
    return { ok: false, error: "Unknown provider." };
  }

  try {
    const { activeOrg, role } = await resolveActiveOrg(session.user.id);
    if (role !== "owner") {
      return {
        ok: false,
        error: "Only organization owners can manage AI provider keys.",
      };
    }

    const removed = await deleteOrgLlmCredential(activeOrg.id, input.provider);
    if (!removed) {
      return { ok: false, error: "No key saved for that provider." };
    }
    revalidateAiSettings();
    return { ok: true };
  } catch (err) {
    console.error("deleteOrgLlmCredentialAction", err);
    return { ok: false, error: "Couldn't remove the key. Try again." };
  }
}

/** Toggle the daily project-summary routine (owners only). */
export async function setDailySummaryEnabledAction(input: {
  enabled: boolean;
}): Promise<LlmCredentialActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to update settings." };

  try {
    const { activeOrg, role } = await resolveActiveOrg(session.user.id);
    if (role !== "owner") {
      return {
        ok: false,
        error: "Only organization owners can change the daily summary routine.",
      };
    }

    await setOrgDailySummaryEnabled(activeOrg.id, input.enabled);
    revalidateAiSettings();
    return { ok: true };
  } catch (err) {
    console.error("setDailySummaryEnabledAction", err);
    return {
      ok: false,
      error: "Couldn't update the daily summary setting. Try again.",
    };
  }
}

/** Toggle the Monday team progress email (owners only; team orgs). */
export async function setWeeklyDigestEnabledAction(input: {
  enabled: boolean;
}): Promise<LlmCredentialActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to update settings." };

  try {
    const { activeOrg, role } = await resolveActiveOrg(session.user.id);
    if (role !== "owner") {
      return {
        ok: false,
        error: "Only organization owners can change the weekly email snapshot.",
      };
    }
    if (activeOrg.isPersonal) {
      return {
        ok: false,
        error: "Weekly email snapshots are for team organizations.",
      };
    }

    await setOrgWeeklyDigestEnabled(activeOrg.id, input.enabled);
    revalidateAiSettings();
    return { ok: true };
  } catch (err) {
    console.error("setWeeklyDigestEnabledAction", err);
    return {
      ok: false,
      error: "Couldn't update the weekly email setting. Try again.",
    };
  }
}

export type WeeklyDigestSendState =
  | { ok: true; emailed: number; skippedNoActivity: boolean }
  | { ok: false; error: string };

/** Send this week's snapshot now (owners only; team orgs). */
export async function sendWeeklyDigestNowAction(): Promise<WeeklyDigestSendState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to send the snapshot." };

  try {
    const { activeOrg, role } = await resolveActiveOrg(session.user.id);
    if (role !== "owner") {
      return {
        ok: false,
        error: "Only organization owners can send the weekly email snapshot.",
      };
    }
    if (activeOrg.isPersonal) {
      return {
        ok: false,
        error: "Weekly email snapshots are for team organizations.",
      };
    }

    const result = await runWeeklyOrgDigests(new Date(), {
      orgId: activeOrg.id,
      force: true,
    });
    if (result.skippedNoEmail > 0) {
      return { ok: false, error: "Email isn't configured in this environment." };
    }
    if (result.failed > 0 && result.emailed === 0) {
      return { ok: false, error: "Couldn't send the snapshot. Try again." };
    }
    return {
      ok: true,
      emailed: result.emailed,
      skippedNoActivity: result.skippedNoActivity > 0 && result.emailed === 0,
    };
  } catch (err) {
    console.error("sendWeeklyDigestNowAction", err);
    return { ok: false, error: "Couldn't send the snapshot. Try again." };
  }
}


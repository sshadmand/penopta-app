"use client";

import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import Anthropic from "@/components/icons/Anthropic";
import Gemini from "@/components/icons/Gemini";
import OpenAI from "@/components/icons/OpenAI";
import {
  deleteOrgLlmCredentialAction,
  saveOrgLlmCredentialAction,
} from "@/lib/ai/actions";
import type { LlmCredentialPublic } from "@/lib/ai/models";
import {
  DEFAULT_LLM_MODELS,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDER_PREFERENCE,
} from "@/lib/ai/models";
import type { LlmProvider } from "@/lib/db/schema";
import { CheckCircleIcon } from "lucide-react";

const PROVIDER_META: Record<
  LlmProvider,
  {
    name: string;
    placeholder: string;
    hint: string;
    icon: ComponentType<{ className?: string }>;
    iconBg: string;
  }
> = {
  anthropic: {
    name: "Anthropic (Claude)",
    placeholder: "sk-ant-…",
    hint: `Default model: ${DEFAULT_LLM_MODELS.anthropic}`,
    icon: Anthropic,
    iconBg: "bg-[#d97757]",
  },
  google: {
    name: "Google (Gemini)",
    placeholder: "AIza…",
    hint: `Default model: ${DEFAULT_LLM_MODELS.google}`,
    icon: Gemini,
    iconBg: "bg-[#4285F4]",
  },
  openai: {
    name: "OpenAI (ChatGPT)",
    placeholder: "sk-…",
    hint: `Default model: ${DEFAULT_LLM_MODELS.openai}`,
    icon: OpenAI,
    iconBg: "bg-[#10a37f]",
  },
};

/** Filled keys first (preference order), then empty ones. */
function orderedProviders(savedIds: Set<LlmProvider>) {
  const filled = LLM_PROVIDER_PREFERENCE.filter((id) => savedIds.has(id));
  const empty = LLM_PROVIDER_PREFERENCE.filter((id) => !savedIds.has(id));
  return [...filled, ...empty].map((id) => ({ id, ...PROVIDER_META[id] }));
}

function statusSummary(credentials: LlmCredentialPublic[]): string {
  const byProvider = new Map(credentials.map((c) => [c.provider, c]));
  const ordered = LLM_PROVIDER_PREFERENCE.filter((id) => byProvider.has(id));
  if (ordered.length === 0) return "No AI keys saved";

  const parts = ordered.map((id, index) => {
    const saved = byProvider.get(id)!;
    const model = saved.model?.trim() || DEFAULT_LLM_MODELS[id];
    const role =
      ordered.length > 1 ? (index === 0 ? " · primary" : " · fallback") : "";
    return `${LLM_PROVIDER_LABELS[id]} (…${saved.keyLast4})${role} · ${model}`;
  });
  return parts.join(" · ");
}

export function AiKeysPanel({
  credentials,
  canManage,
}: {
  credentials: LlmCredentialPublic[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Collapse only after a full reload when keys already exist — soft refresh
  // after save keeps this true so the form doesn't jump away mid-flow.
  const [editing, setEditing] = useState(credentials.length === 0);
  const [drafts, setDrafts] = useState<Record<LlmProvider, string>>({
    anthropic: "",
    openai: "",
    google: "",
  });
  const [replacing, setReplacing] = useState<
    Partial<Record<LlmProvider, boolean>>
  >({});

  const byProvider = new Map(credentials.map((c) => [c.provider, c]));
  const savedIds = new Set(credentials.map((c) => c.provider));
  const providers = orderedProviders(savedIds);
  const primaryProvider = providers.find((p) => savedIds.has(p.id))?.id;
  const hasMultipleKeys = savedIds.size > 1;
  const hasSaved = credentials.length > 0;
  const showEditor = !hasSaved || editing;

  function save(provider: LlmProvider) {
    const apiKey = drafts[provider].trim();
    if (!apiKey) {
      toast.error("Paste an API key first.");
      return;
    }
    startTransition(async () => {
      const result = await saveOrgLlmCredentialAction({ provider, apiKey });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${LLM_PROVIDER_LABELS[provider]} key verified and saved`);
      setDrafts((prev) => ({ ...prev, [provider]: "" }));
      setReplacing((prev) => ({ ...prev, [provider]: false }));
      router.refresh();
    });
  }

  function remove(provider: LlmProvider) {
    startTransition(async () => {
      const result = await deleteOrgLlmCredentialAction({ provider });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Key removed");
      setDrafts((prev) => ({ ...prev, [provider]: "" }));
      setReplacing((prev) => ({ ...prev, [provider]: false }));
      router.refresh();
    });
  }

  if (!showEditor) {
    return (
      <section className="mt-8 rounded-lg p-2 px-4 bg-sidebar">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="min-w-0 flex items-center gap-2 text-sm text-foreground">
            <CheckCircleIcon className="size-4 text-success" />
            Using{" "}
            <span className="text-2xs font-medium text-success mt-px">
              {statusSummary(credentials)}
            </span>
          </p>
          {canManage ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mr-2 text-sm text-muted hover:text-foreground"
            >
              Review
            </button>
          ) : (
            <p className="text-sm text-muted">
              Only organization owners can change keys.
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {hasSaved && canManage ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:bg-background"
          >
            Done
          </button>
        </div>
      ) : null}
      {providers.map((provider) => {
        const saved = byProvider.get(provider.id);
        const Icon = provider.icon;
        const isPrimary = provider.id === primaryProvider;
        const isReplacing = Boolean(replacing[provider.id]);
        const showForm = canManage && (!saved || isReplacing);
        return (
          <section
            key={provider.id}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${provider.iconBg}`}
                >
                  <Icon className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-foreground">
                      {provider.name}
                    </h2>
                    {isPrimary ? (
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-success">
                        {hasMultipleKeys ? "Primary" : "In use"}
                      </span>
                    ) : null}
                    {saved && hasMultipleKeys && !isPrimary ? (
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
                        Fallback
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{provider.hint}</p>
                  {saved ? (
                    <p className="mt-2 text-sm text-success">
                      Saved · ends in {saved.keyLast4}
                      {saved.model ? ` · model ${saved.model}` : null}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted">No key saved</p>
                  )}
                </div>
              </div>
              {canManage && saved ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setReplacing((prev) => ({
                        ...prev,
                        [provider.id]: !prev[provider.id],
                      }));
                      if (isReplacing) {
                        setDrafts((prev) => ({ ...prev, [provider.id]: "" }));
                      }
                    }}
                    className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
                  >
                    {isReplacing ? "Cancel" : "Replace"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(provider.id)}
                    className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </div>

            {showForm ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={drafts[provider.id]}
                  disabled={pending}
                  placeholder={
                    saved
                      ? `New key (${provider.placeholder})`
                      : provider.placeholder
                  }
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [provider.id]: e.target.value,
                    }))
                  }
                  className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={pending || !drafts[provider.id].trim()}
                  onClick={() => save(provider.id)}
                  className="h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {pending
                    ? "Checking…"
                    : saved
                      ? "Verify & update"
                      : "Verify & save"}
                </button>
              </div>
            ) : !canManage ? (
              <p className="mt-3 text-sm text-muted">
                Only organization owners can add or replace keys.
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

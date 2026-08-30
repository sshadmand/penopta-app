"use client";

import Link from "next/link";
import { Check, Copy, Send } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatMarkdown } from "@/components/ChatMarkdown";
import { CompactTime } from "@/components/LocalTime";
import type { StatsChatMessagePublic } from "@/lib/stats/chat-data";
import { useIsHydrated } from "@/lib/use-hydrated";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;
const PENDING_SUFFIX = "-pending";
const CHAT_PATH = "/api/settings/stats/chat";

function CopyChatMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : "Copy"}
      aria-label={copied ? "Copied" : "Copy as markdown"}
      className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden strokeWidth={2} />
      ) : (
        <Copy className="size-3.5" aria-hidden strokeWidth={2} />
      )}
    </button>
  );
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function assistantAfterUser(
  messages: StatsChatMessagePublic[],
  userMessageId: string,
): StatsChatMessagePublic | null {
  const userIdx = messages.findIndex((m) => m.id === userMessageId);
  if (userIdx < 0) return null;
  return (
    messages.slice(userIdx + 1).find((m) => m.role === "assistant") ?? null
  );
}

function incompleteUserTurn(
  messages: StatsChatMessagePublic[],
): StatsChatMessagePublic | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return null;
  if (assistantAfterUser(messages, last.id)) return null;
  const ageMs = Date.now() - new Date(last.createdAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > POLL_TIMEOUT_MS) {
    return null;
  }
  return last;
}

function workingPlaceholder(
  userMessage: StatsChatMessagePublic,
): StatsChatMessagePublic {
  return {
    id: `${userMessage.id}${PENDING_SUFFIX}`,
    role: "assistant",
    text: "Working…",
    meta: null,
    isError: false,
    authorUserId: null,
    createdAt: userMessage.createdAt,
  };
}

function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Composer plus Q&A thread for Analytics. */
export function StatsChat({
  initialMessages,
  hasLlmKey,
  currentUserId,
}: {
  initialMessages: StatsChatMessagePublic[];
  hasLlmKey: boolean;
  currentUserId: string;
}) {
  const [resumeUserId] = useState(
    () => incompleteUserTurn(initialMessages)?.id ?? null,
  );
  const [messages, setMessages] = useState<StatsChatMessagePublic[]>(() => {
    const last = incompleteUserTurn(initialMessages);
    if (!last) return initialMessages;
    return [...initialMessages, workingPlaceholder(last)];
  });
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(() => resumeUserId !== null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hydrated = useIsHydrated();

  useEffect(() => {
    if (!pending) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pending, messages.length]);

  function stopPolling() {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
  }

  async function pollForReply(userMessageId: string) {
    stopPolling();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS, controller.signal);
        const res = await fetch(CHAT_PATH, { signal: controller.signal });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          messages?: StatsChatMessagePublic[];
        };
        if (!data.messages) continue;

        const assistant = assistantAfterUser(data.messages, userMessageId);
        if (!assistant) continue;

        setMessages(data.messages);
        setPending(false);
        return;
      }

      setMessages((prev) =>
        prev.filter((m) => m.id !== `${userMessageId}${PENDING_SUFFIX}`),
      );
      setPending(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setPending(false);
    } finally {
      if (pollAbortRef.current === controller) {
        pollAbortRef.current = null;
      }
    }
  }

  const startResumePoll = useEffectEvent((userMessageId: string) => {
    void pollForReply(userMessageId);
  });

  useEffect(() => {
    if (!resumeUserId) return;
    const timer = window.setTimeout(() => {
      startResumePoll(resumeUserId);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
    };
  }, [resumeUserId]);

  async function submit() {
    const text = value.trim();
    if (!text || pending) return;

    setValue("");
    setPending(true);
    stopPolling();

    const optimisticId = `optimistic-${Date.now()}`;
    const nowIso = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: "user",
        text,
        meta: null,
        isError: false,
        authorUserId: currentUserId,
        createdAt: nowIso,
      },
      {
        id: `${optimisticId}${PENDING_SUFFIX}`,
        role: "assistant",
        text: "Working…",
        meta: null,
        isError: false,
        authorUserId: null,
        createdAt: nowIso,
      },
    ]);

    try {
      const res = await fetch(CHAT_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          timezone: viewerTimeZone(),
        }),
      });
      const data = (await res.json()) as {
        messages?: StatsChatMessagePublic[];
        pending?: boolean;
        error?: string;
      };

      if (!res.ok || !data.messages?.length) {
        setMessages((prev) => [
          ...prev.filter(
            (m) =>
              m.id !== optimisticId &&
              m.id !== `${optimisticId}${PENDING_SUFFIX}`,
          ),
          {
            id: optimisticId,
            role: "user",
            text,
            meta: null,
            isError: false,
            authorUserId: currentUserId,
            createdAt: nowIso,
          },
          {
            id: `${optimisticId}-err`,
            role: "assistant",
            text: data.error ?? "Couldn't send. Try again.",
            meta: null,
            isError: true,
            authorUserId: null,
            createdAt: new Date().toISOString(),
          },
        ]);
        setPending(false);
        return;
      }

      const userMessage = data.messages.find((m) => m.role === "user");
      if (!userMessage) {
        setPending(false);
        return;
      }

      setMessages((prev) => {
        const withoutOptimistic = prev.filter(
          (m) =>
            m.id !== optimisticId &&
            m.id !== `${optimisticId}${PENDING_SUFFIX}`,
        );
        return [
          ...withoutOptimistic,
          userMessage,
          workingPlaceholder(userMessage),
        ];
      });
      void pollForReply(userMessage.id);
    } catch {
      setMessages((prev) => [
        ...prev.filter(
          (m) =>
            m.id !== optimisticId &&
            m.id !== `${optimisticId}${PENDING_SUFFIX}`,
        ),
        {
          id: optimisticId,
          role: "user",
          text,
          meta: null,
          isError: false,
          authorUserId: currentUserId,
          createdAt: nowIso,
        },
        {
          id: `${optimisticId}-err`,
          role: "assistant",
          text: "Couldn't send. Try again.",
          meta: null,
          isError: true,
          authorUserId: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setPending(false);
    }
  }

  const visible = messages.filter(
    (m) => !m.id.endsWith(PENDING_SUFFIX) || pending,
  );

  return (
    <section className="mt-10" aria-labelledby="stats-chat-heading">
      <h2
        id="stats-chat-heading"
        className="text-lg font-semibold tracking-tight"
      >
        Ask about these stats
      </h2>
      <p className="mt-1 text-sm text-muted">
        Questions about tokens, plans, projects, and agents in this workspace.
      </p>

      {visible.length > 0 ? (
        <ul className="mt-6 space-y-1">
          {visible.map((msg) => {
            const mine = msg.role === "user";
            const canCopy =
              Boolean(msg.text.trim()) && !msg.id.endsWith(PENDING_SUFFIX);
            return (
              <li
                key={msg.id}
                className={`group/msg my-2 flex flex-col last:mb-0 ${mine ? "items-end" : "items-start"}`}
              >
                <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted">
                  <span className="font-medium">
                    {mine ? "You" : "Penopta"}
                  </span>
                  {hydrated ? <CompactTime at={msg.createdAt} /> : null}
                </div>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    mine
                      ? "w-[min(100%,20rem)] max-w-[80%] wrap-anywhere whitespace-pre-wrap bg-skeleton text-foreground sm:w-[80%]"
                      : msg.isError
                        ? "w-full border border-amber-200 bg-amber-50 text-amber-950"
                        : "w-full max-w-[90%] bg-surface text-foreground"
                  }`}
                >
                  {mine ? msg.text : <ChatMarkdown>{msg.text}</ChatMarkdown>}
                  {msg.isError && msg.meta === "Review integrations" ? (
                    <>
                      {" "}
                      <Link
                        href="/settings/integrations/ai"
                        className="font-medium text-accent underline underline-offset-2 hover:opacity-90"
                      >
                        Review integrations
                      </Link>
                    </>
                  ) : null}
                </div>
                {msg.meta &&
                !(msg.isError && msg.meta === "Review integrations") ? (
                  <p className="mt-1 px-1 text-xs text-muted">{msg.meta}</p>
                ) : null}
                {canCopy ? (
                  <div
                    className={`mt-0.5 flex px-0.5 opacity-100 transition md:opacity-0 md:group-hover/msg:opacity-100 md:group-focus-within/msg:opacity-100 ${
                      mine ? "justify-end" : "justify-start"
                    }`}
                  >
                    <CopyChatMessageButton text={msg.text} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div ref={bottomRef} />

      <div className="mt-6">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-lg shadow-black/5">
          <textarea
            rows={1}
            value={value}
            disabled={pending || !hasLlmKey}
            placeholder={
              hasLlmKey
                ? "How much did I work this week?"
                : "Add an AI key under Integrations to chat"
            }
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            className="min-h-10 max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted disabled:opacity-60"
          />
          <button
            type="button"
            disabled={pending || !hasLlmKey || !value.trim()}
            onClick={() => void submit()}
            title="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Send aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          {hasLlmKey ? (
            <>
              Or{" "}
              <Link href="/settings/integrations/mcp" className="text-blue-500">
                connect
              </Link>{" "}
              and use the Penopta MCP to chat in our favorite clients.
            </>
          ) : (
            <>
              Add a Claude or ChatGPT key in{" "}
              <Link
                href="/settings/integrations/ai"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Instructions &amp; Forms → LLM Keys
              </Link>
            </>
          )}
        </p>
      </div>
    </section>
  );
}

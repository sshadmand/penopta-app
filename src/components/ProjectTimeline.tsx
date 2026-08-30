"use client";

import Link from "next/link";
import { Check, Copy, MessageSquare, Send } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { AddAgentsHelper } from "@/components/AddAgentsHelper";
import { AgentBrandIcon } from "@/components/AgentBrandIcon";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { ClampedChatMarkdown } from "@/components/ClampedChatMarkdown";
import { CompactTime, TimelineDayDivider } from "@/components/LocalTime";
import { CollapsibleActivityGroup } from "@/components/ProjectActivityFeed";
import { SummaryPostFrame } from "@/components/SummaryPostFrame";
import {
  activitySourceKey,
  dayKey,
  type ProjectActivityLine,
} from "@/lib/projects/activity-feed";
import type { ProjectChatMessagePublic } from "@/lib/projects/chat-data";
import { isSummaryChatMeta } from "@/lib/projects/chat-meta";
import { useIsHydrated } from "@/lib/use-hydrated";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;
const PENDING_SUFFIX = "-pending";

/** Claude/ChatGPT-style: icon under the message, check on success, raw markdown to clipboard. */
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

function isEphemeralChatId(id: string) {
  return id.startsWith("ephemeral-");
}

function mergeServerChat(
  server: ProjectChatMessagePublic[],
  local: ProjectChatMessagePublic[],
): ProjectChatMessagePublic[] {
  const serverIds = new Set(server.map((m) => m.id));
  const keep = local.filter(
    (m) => isEphemeralChatId(m.id) && !serverIds.has(m.id),
  );
  if (keep.length === 0) return server;
  return [...server, ...keep].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function assistantAfterUser(
  messages: ProjectChatMessagePublic[],
  userMessageId: string,
): ProjectChatMessagePublic | null {
  const userIdx = messages.findIndex((m) => m.id === userMessageId);
  if (userIdx < 0) return null;
  return (
    messages.slice(userIdx + 1).find((m) => m.role === "assistant") ?? null
  );
}

function incompleteUserTurn(
  messages: ProjectChatMessagePublic[],
): ProjectChatMessagePublic | null {
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
  userMessage: ProjectChatMessagePublic,
): ProjectChatMessagePublic {
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

function TimelineSourceHeader({
  projectLabel,
  agentName,
}: {
  projectLabel: string;
  agentName: string;
}) {
  return (
    <li className="mt-1 flex items-center gap-1.5 px-0 text-xs font-medium text-muted first:mt-0 mx-2">
      <AgentBrandIcon
        agentName={agentName}
        className="size-3 shrink-0 opacity-20"
      />
      <span
        className="min-w-0 truncate text-foreground/30"
        title={projectLabel}
      >
        {projectLabel}
      </span>
    </li>
  );
}

type TimelineItem =
  | { kind: "activity"; sortAt: number; key: string; line: ProjectActivityLine }
  | {
      kind: "chat";
      sortAt: number;
      key: string;
      message: ProjectChatMessagePublic;
    };

type TimelineBlock =
  | { kind: "day"; key: string; at: number }
  | {
      kind: "source";
      key: string;
      projectLabel: string;
      agentName: string;
    }
  | {
      kind: "activity-group";
      key: string;
      sortAt: number;
      lines: ProjectActivityLine[];
    }
  | {
      kind: "chat";
      key: string;
      sortAt: number;
      message: ProjectChatMessagePublic;
    };

function mergeTimeline(
  activity: ProjectActivityLine[],
  chat: ProjectChatMessagePublic[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...activity.map((line) => ({
      kind: "activity" as const,
      sortAt: line.sortAt,
      key: `activity-${line.key}`,
      line,
    })),
    ...chat.map((message) => ({
      kind: "chat" as const,
      sortAt: new Date(message.createdAt).getTime(),
      key: `chat-${message.id}`,
      message,
    })),
  ];
  return items.sort((a, b) => a.sortAt - b.sortAt);
}

/** Collapse consecutive identical thread notices; chat, day, or a different thread splits. */
function buildTimelineBlocks(
  items: TimelineItem[],
  { groupByDay = true }: { groupByDay?: boolean } = {},
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  let activityRun: ProjectActivityLine[] = [];
  let activityRunKey = "";
  let lastSourceKey: string | null = null;

  function flushActivity() {
    if (activityRun.length === 0) return;
    blocks.push({
      kind: "activity-group",
      key: activityRunKey,
      sortAt: activityRun[0].sortAt,
      lines: activityRun,
    });
    activityRun = [];
    activityRunKey = "";
  }

  function ensureSourceHeader(line: ProjectActivityLine) {
    const sourceKey = activitySourceKey(line);
    if (sourceKey === lastSourceKey) return;
    lastSourceKey = sourceKey;
    blocks.push({
      kind: "source",
      key: `source-${sourceKey}-${line.key}`,
      projectLabel: line.projectLabel,
      agentName: line.agentName,
    });
  }

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const prev = index > 0 ? items[index - 1] : null;
    const dayChanged =
      groupByDay && (!prev || dayKey(prev.sortAt) !== dayKey(item.sortAt));

    if (dayChanged) {
      flushActivity();
      lastSourceKey = null;
      blocks.push({
        kind: "day",
        key: `day-${dayKey(item.sortAt)}`,
        at: item.sortAt,
      });
    }

    if (item.kind === "chat") {
      flushActivity();
      lastSourceKey = null;
      blocks.push({
        kind: "chat",
        key: item.key,
        sortAt: item.sortAt,
        message: item.message,
      });
      continue;
    }

    // Only stack back-to-back notices for the same thread (true dupes).
    if (
      activityRun.length > 0 &&
      activityRun[activityRun.length - 1].threadId !== item.line.threadId
    ) {
      flushActivity();
    }

    if (activityRun.length === 0) {
      ensureSourceHeader(item.line);
      activityRunKey = `activity-group-${item.key}`;
    }
    activityRun.push(item.line);
  }

  flushActivity();
  return blocks;
}

/**
 * Project overview timeline: agent activity notices and project chat turns
 * share one chronological list (same time-stamp column).
 */
export function ProjectTimeline({
  projectId,
  activityLines,
  initialChatMessages,
  hasLlmKey,
  currentUserId,
  needsAgents = false,
}: {
  projectId: string;
  activityLines: ProjectActivityLine[];
  initialChatMessages: ProjectChatMessagePublic[];
  hasLlmKey: boolean;
  currentUserId: string;
  /** No threads or source projects hooked up — prompt to connect agents. */
  needsAgents?: boolean;
}) {
  const [resumeUserId] = useState(
    () => incompleteUserTurn(initialChatMessages)?.id ?? null,
  );
  const [chatMessages, setChatMessages] = useState<ProjectChatMessagePublic[]>(
    () => {
      const last = incompleteUserTurn(initialChatMessages);
      if (!last) return initialChatMessages;
      return [...initialChatMessages, workingPlaceholder(last)];
    },
  );
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(() => resumeUserId !== null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pollAbortRef = useRef<AbortController | null>(null);

  const hydrated = useIsHydrated();
  const items = useMemo(
    () => mergeTimeline(activityLines, chatMessages),
    [activityLines, chatMessages],
  );
  const blocks = useMemo(
    () => buildTimelineBlocks(items, { groupByDay: hydrated }),
    [items, hydrated],
  );

  // Open (and remount) at the latest timeline entry.
  useLayoutEffect(() => {
    const scroller = listRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, []);

  useEffect(() => {
    if (!pending) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pending, chatMessages.length]);

  function stopPolling() {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
  }

  function showWorkingPlaceholder(
    userMessage: ProjectChatMessagePublic,
    replaceOptimisticId?: string,
  ) {
    const pendingId = `${userMessage.id}${PENDING_SUFFIX}`;
    setChatMessages((prev) => {
      const without = replaceOptimisticId
        ? prev.filter(
            (m) =>
              m.id !== replaceOptimisticId &&
              m.id !== `${replaceOptimisticId}${PENDING_SUFFIX}` &&
              m.id !== pendingId,
          )
        : prev.filter((m) => m.id !== pendingId);
      const withoutUserDup = without.filter((m) => m.id !== userMessage.id);
      return [...withoutUserDup, userMessage, workingPlaceholder(userMessage)];
    });
  }

  async function pollForReply(userMessageId: string) {
    stopPolling();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS, controller.signal);
        const res = await fetch(`/api/projects/${projectId}/chat`, {
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          messages?: ProjectChatMessagePublic[];
        };
        if (!data.messages) continue;

        const assistant = assistantAfterUser(data.messages, userMessageId);
        if (!assistant) continue;

        setChatMessages((prev) => mergeServerChat(data.messages!, prev));
        setPending(false);
        return;
      }

      // Timed out waiting — drop the Working… bubble; reply may still land later.
      setChatMessages((prev) =>
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

  // Resume polling if we remounted while an accepted turn is still running.
  // Placeholder + pending come from initial state; the timer callback starts the
  // server poll so setState is not synchronous in the effect body.
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
  }, [projectId, resumeUserId]);

  async function submit() {
    const text = value.trim();
    if (!text || pending) return;

    setValue("");
    setPending(true);
    stopPolling();

    // Optimistic placeholder so the turn appears immediately on the timeline.
    const optimisticId = `optimistic-${Date.now()}`;
    const nowIso = new Date().toISOString();
    setChatMessages((prev) => [
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
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        messages?: ProjectChatMessagePublic[];
        pending?: boolean;
        error?: string;
      };

      if (!res.ok || !data.messages?.length) {
        setChatMessages((prev) => [
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
      const syncComplete = !data.pending && res.status !== 202;

      if (syncComplete) {
        setChatMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (m) =>
              m.id !== optimisticId &&
              m.id !== `${optimisticId}${PENDING_SUFFIX}`,
          );
          const existing = new Set(withoutOptimistic.map((m) => m.id));
          const incoming = data.messages!.filter((m) => !existing.has(m.id));
          return [...withoutOptimistic, ...incoming];
        });
        setPending(false);
        return;
      }

      if (!userMessage) {
        setPending(false);
        return;
      }

      showWorkingPlaceholder(userMessage, optimisticId);
      void pollForReply(userMessage.id);
    } catch {
      setChatMessages((prev) => [
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
          text: "Network error. Try again.",
          meta: null,
          isError: true,
          authorUserId: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setPending(false);
    }
  }

  const empty = items.length === 0;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
          {empty ? (
            needsAgents ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6">
                <AddAgentsHelper />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-skeleton text-muted">
                  <MessageSquare
                    aria-hidden
                    className="h-5 w-5"
                    strokeWidth={1.5}
                  />
                </span>
                <p className="mt-4 text-sm font-medium text-foreground">
                  No messages yet
                </p>
                <p className="mt-1 text-sm text-muted">
                  Agent activity and project chat will show up here on one
                  timeline
                </p>
              </div>
            )
          ) : (
            <ul className="flex flex-col gap-1.5 px-4 pb-4">
              {blocks.map((block) => {
                if (block.kind === "day") {
                  return <TimelineDayDivider key={block.key} at={block.at} />;
                }

                if (block.kind === "source") {
                  return (
                    <TimelineSourceHeader
                      key={block.key}
                      projectLabel={block.projectLabel}
                      agentName={block.agentName}
                    />
                  );
                }

                if (block.kind === "activity-group") {
                  return (
                    <CollapsibleActivityGroup
                      key={block.key}
                      lines={block.lines}
                      projectId={projectId}
                    />
                  );
                }

                const msg = block.message;
                const mine = msg.role === "user";
                const isSummary = !mine && isSummaryChatMeta(msg.meta);
                const who = mine
                  ? msg.authorUserId === currentUserId
                    ? "You"
                    : "Member"
                  : "Penopta";

                const canCopy =
                  Boolean(msg.text.trim()) && !msg.id.endsWith(PENDING_SUFFIX);

                if (isSummary) {
                  return (
                    <li
                      key={block.key}
                      className="group/msg my-2 flex flex-col items-start last:mb-0"
                    >
                      <SummaryPostFrame
                        header={
                          <>
                            <span className="text-xs font-medium text-foreground">
                              Summary
                            </span>
                            <CompactTime
                              at={msg.createdAt}
                              className="text-xs text-muted"
                            />
                          </>
                        }
                        meta={msg.meta}
                      >
                        <ClampedChatMarkdown>{msg.text}</ClampedChatMarkdown>
                      </SummaryPostFrame>
                      {canCopy ? (
                        <div className="mt-0.5 flex justify-start px-0.5 opacity-100 transition md:opacity-0 md:group-hover/msg:opacity-100 md:group-focus-within/msg:opacity-100">
                          <CopyChatMessageButton text={msg.text} />
                        </div>
                      ) : null}
                    </li>
                  );
                }

                return (
                  <li
                    key={block.key}
                    className={`group/msg my-2 flex flex-col last:mb-0 ${mine ? "items-end" : "items-start"}`}
                  >
                    <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted">
                      <span className="font-medium">{who}</span>
                      <CompactTime at={msg.createdAt} />
                    </div>
                    <div
                      className={`rounded-2xl py-2.5 px-1 text-sm leading-relaxed ${
                        mine
                          ? // Keep short messages (e.g. "ho") from collapsing into a tiny chip
                            "w-[min(100%,20rem)] max-w-[80%] wrap-anywhere whitespace-pre-wrap bg-skeleton px-4 text-foreground sm:w-[80%]"
                          : msg.isError
                            ? "w-full border border-amber-200 bg-amber-50 text-amber-950"
                            : "w-full text-foreground"
                      }`}
                    >
                      {mine ? (
                        msg.text
                      ) : (
                        <ChatMarkdown>{msg.text}</ChatMarkdown>
                      )}
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
                      <p className="mt-1 px-1 text-xs mx-3 text-muted">
                        {msg.meta}
                      </p>
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
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {empty && needsAgents ? null : (
        <div className="shrink-0  px-6 pt-0 pb-4">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-lg shadow-black/5">
              <textarea
                rows={1}
                value={value}
                disabled={pending}
                placeholder={
                  hasLlmKey
                    ? "Ask about this workgroup… /summary 24h or /continue"
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
                disabled={pending || !value.trim()}
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
                  <Link
                    href="/settings/integrations/mcp"
                    className="text-blue-500"
                  >
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
        </div>
      )}
    </main>
  );
}

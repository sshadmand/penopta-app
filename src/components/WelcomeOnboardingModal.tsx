"use client";

import { Check, CheckCircle2, Code2, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import Anthropic from "@/components/icons/Anthropic";
import Apple from "@/components/icons/Apple";
import Cursor from "@/components/icons/Cursor";
import Linux from "@/components/icons/Linux";
import OpenAI from "@/components/icons/OpenAI";
import { INTEGRATIONS_PATH } from "@/lib/integrations/paths";
import {
  EMPTY_ONBOARDING_SELECTIONS,
  ONBOARDING_STEP_COPY,
  onboardingChoiceSummary,
  onboardingHeardLines,
  onboardingSetupItems,
  onboardingStepAnswered,
  onboardingSteps,
  onboardingSubmittedSelections,
  type OnboardingChoiceRow,
  type OnboardingSetupItem,
} from "@/lib/onboarding/plan";

type WorkKey = "code" | "chat";
type InterfaceKey = "claude" | "chatgpt" | "cursor";
type OsKey = "mac" | "linux";

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
        checked
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-surface text-transparent"
      }`}
    >
      <Check className="size-3.5" strokeWidth={2.5} />
    </span>
  );
}

function OptionRow({
  checked,
  onToggle,
  title,
  description,
  icon,
  muted = false,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  muted?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-lg px-3 py-5 transition hover:bg-background">
      {icon}
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-medium ${
            muted ? "text-muted" : "text-foreground"
          }`}
        >
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="sr-only"
      />
      <CheckMark checked={checked} />
    </label>
  );
}

function IconWell({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${className}`}
    >
      {children}
    </span>
  );
}

function ReviewPage({
  titleId,
  title,
  description,
  choices,
  setupItems,
}: {
  titleId: string;
  title: string;
  description: string;
  choices: OnboardingChoiceRow[];
  setupItems: OnboardingSetupItem[];
}) {
  const required = setupItems.filter((item) => !item.extra);
  const extras = setupItems.filter((item) => item.extra);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <section>
        <h3 id={titleId} className="text-sm font-semibold">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border">
          {choices.map((row) => (
            <div key={row.label} className="px-4 py-3">
              <dt className="text-xs text-muted">{row.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6">
        <h3 className="text-sm font-semibold">What you need to do</h3>
        <p className="mt-0.5 text-xs text-muted">
          Open a step to see the full setup instructions.
        </p>
        {required.length === 0 && extras.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Nothing to set up yet. You can connect agents later from{" "}
            <Link
              href={INTEGRATIONS_PATH}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Integrations
            </Link>
            .
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {required.map((item, index) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block rounded-xl border border-border bg-surface px-4 py-3 transition hover:bg-background"
                >
                  <p className="text-sm font-medium text-foreground">
                    {index + 1}. {item.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    {item.action}
                  </p>
                </Link>
              </li>
            ))}
            {extras.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block rounded-xl border border-dashed border-border bg-surface px-4 py-3 transition hover:bg-background"
                >
                  <p className="text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    {item.action}
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** Welcome modal: pick how you work; the right rail lists what to set up. */
export function WelcomeOnboardingModal() {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [selections, setSelections] = useState(EMPTY_ONBOARDING_SELECTIONS);
  const steps = onboardingSteps(selections);
  const currentIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[currentIndex];
  const submitted = onboardingSubmittedSelections(selections, currentStep);
  const setupItems = onboardingSetupItems(submitted);
  const heardLines = onboardingHeardLines(submitted);
  const stepCopy = ONBOARDING_STEP_COPY[currentStep];
  const canContinue = onboardingStepAnswered(currentStep, selections);
  const isReview = currentStep === "review";
  const choices = onboardingChoiceSummary(selections);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, currentStep]);

  if (!open) return null;

  function toggleWork(key: WorkKey) {
    setSelections((prev) => {
      const next = !prev[key];
      if (key === "code" && !next) {
        return {
          ...prev,
          code: false,
          noneWork: false,
          cursor: false,
          mac: false,
          linux: false,
          noneOs: false,
        };
      }
      return { ...prev, [key]: next, noneWork: false };
    });
  }

  function toggleNoneWork() {
    setSelections((prev) => {
      const next = !prev.noneWork;
      if (!next) return { ...prev, noneWork: false };
      return {
        ...prev,
        noneWork: true,
        code: false,
        chat: false,
        cursor: false,
        mac: false,
        linux: false,
        noneOs: false,
      };
    });
  }

  function toggleInterface(key: InterfaceKey) {
    setSelections((prev) => {
      const next = !prev[key];
      if (key === "cursor" && next) {
        return {
          ...prev,
          cursor: true,
          mac: true,
          noneInterface: false,
          noneOs: false,
        };
      }
      return { ...prev, [key]: next, noneInterface: false };
    });
  }

  function toggleNoneInterface() {
    setSelections((prev) => {
      const next = !prev.noneInterface;
      if (!next) return { ...prev, noneInterface: false };
      return {
        ...prev,
        noneInterface: true,
        claude: false,
        chatgpt: false,
        cursor: false,
      };
    });
  }

  function toggleOs(key: OsKey) {
    setSelections((prev) => ({ ...prev, [key]: !prev[key], noneOs: false }));
  }

  function toggleNoneOs() {
    setSelections((prev) => {
      const next = !prev.noneOs;
      if (!next) return { ...prev, noneOs: false };
      return { ...prev, noneOs: true, mac: false, linux: false };
    });
  }

  function close() {
    setOpen(false);
  }

  function goBack() {
    setStepIndex((index) => Math.max(0, index - 1));
  }

  function goNext() {
    if (!canContinue) return;
    if (isReview) {
      close();
      return;
    }
    setStepIndex((index) => index + 1);
  }

  return (
    <div
      className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16 sm:pt-24"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-[80vh] max-h-200 w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl outline-none"
      >
        <div className="border-b border-border px-6 py-4">
          <p id={descriptionId} className="mt-1 ml-2 text-sm text-muted">
            Let&apos;s help get you started with Penopta.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {isReview ? (
            <ReviewPage
              titleId={titleId}
              title={stepCopy.title}
              description={stepCopy.description}
              choices={choices}
              setupItems={setupItems}
            />
          ) : (
            <>
              <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 lg:w-6/10">
                <section className="rounded-xl border border-border">
                  <header className="border-b border-border px-4 py-3">
                    <h3 id={titleId} className="text-sm font-semibold">
                      {stepCopy.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {stepCopy.description}
                    </p>
                  </header>
                  <div className="divide-y divide-border">
                    {currentStep === "work" ? (
                      <>
                        <OptionRow
                          checked={selections.code}
                          onToggle={() => toggleWork("code")}
                          icon={
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/5 text-foreground">
                              <Code2 className="size-4" aria-hidden />
                            </span>
                          }
                          title="I code or use workspaces"
                          description="Local agents and IDEs — we’ll ask which OS you work on."
                        />
                        <OptionRow
                          checked={selections.chat}
                          onToggle={() => toggleWork("chat")}
                          icon={
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/5 text-foreground">
                              <MessageSquareText
                                className="size-4"
                                aria-hidden
                              />
                            </span>
                          }
                          title="I use chat agents for text and docs"
                          description="Claude or ChatGPT in the chat UI — skills and MCP."
                        />
                        <OptionRow
                          muted
                          checked={selections.noneWork}
                          onToggle={toggleNoneWork}
                          title={stepCopy.noneLabel}
                        />
                      </>
                    ) : null}
                    {currentStep === "interfaces" ? (
                      <>
                        <OptionRow
                          checked={selections.claude}
                          onToggle={() => toggleInterface("claude")}
                          icon={
                            <IconWell className="bg-[#d97757]">
                              <Anthropic className="size-4" />
                            </IconWell>
                          }
                          title="Claude"
                          description="Claude chat, Claude Code, or both."
                        />
                        <OptionRow
                          checked={selections.chatgpt}
                          onToggle={() => toggleInterface("chatgpt")}
                          icon={
                            <IconWell className="bg-[#10a37f]">
                              <OpenAI className="size-4" />
                            </IconWell>
                          }
                          title="ChatGPT"
                          description="ChatGPT chat or Codex on a machine."
                        />
                        {selections.code ? (
                          <OptionRow
                            checked={selections.cursor}
                            onToggle={() => toggleInterface("cursor")}
                            icon={
                              <IconWell className="bg-black">
                                <Cursor className="size-4" />
                              </IconWell>
                            }
                            title="Cursor"
                            description="Local Cursor agent chats — synced with the Mac app."
                          />
                        ) : null}
                        <OptionRow
                          muted
                          checked={selections.noneInterface}
                          onToggle={toggleNoneInterface}
                          title={stepCopy.noneLabel}
                        />
                      </>
                    ) : null}
                    {currentStep === "os" ? (
                      <>
                        <OptionRow
                          checked={selections.mac}
                          onToggle={() => toggleOs("mac")}
                          icon={
                            <IconWell className="bg-black">
                              <Apple className="size-4" />
                            </IconWell>
                          }
                          title="Apple Mac"
                          description="Penopta Sync reads local Claude Code, Codex, and Cursor sessions."
                        />
                        <OptionRow
                          checked={selections.linux}
                          onToggle={() => toggleOs("linux")}
                          icon={
                            <IconWell className="bg-black">
                              <Linux className="size-4" />
                            </IconWell>
                          }
                          title="Linux server"
                          description="A headless CLI syncs Claude Code and Codex on the box."
                        />
                        <OptionRow
                          muted
                          checked={selections.noneOs}
                          onToggle={toggleNoneOs}
                          title={stepCopy.noneLabel}
                        />
                      </>
                    ) : null}
                  </div>
                </section>
              </div>

              <aside className="flex w-full max-h-56 shrink-0 flex-col border-t border-border bg-background lg:max-h-none lg:w-4/10 lg:border-t-0 lg:border-l">
                <header className="border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold">
                    What we will help you set up
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Updates as you check boxes.
                  </p>
                </header>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  {heardLines.length === 0 && setupItems.length === 0 ? (
                    <p className="text-xs leading-relaxed text-muted">
                      Select what you use on the left and we’ll fill this in.
                    </p>
                  ) : (
                    <>
                      {heardLines.length > 0 ? (
                        <ul className="space-y-2">
                          {heardLines.map((line) => (
                            <li
                              key={line.id}
                              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs leading-relaxed text-foreground"
                            >
                              <span className="min-w-0 flex-1">{line.text}</span>
                              <CheckCircle2
                                aria-hidden
                                className="size-4 shrink-0 text-success"
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {setupItems.length > 0 ? (
                        <ul className="space-y-2">
                          {setupItems.map((item) => (
                            <li
                              key={item.id}
                              className={`rounded-lg px-3 py-2.5 ${
                                item.extra
                                  ? "border border-dashed border-border bg-surface"
                                  : "border border-border bg-surface"
                              }`}
                            >
                              <p className="text-xs font-medium text-foreground">
                                {item.title}
                              </p>
                              <p className="mt-0.5 text-2xs leading-relaxed text-muted">
                                {item.detail}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              </aside>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          <p className="text-xs text-muted">
            {currentIndex + 1} of {steps.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-background"
            >
              Cancel
            </button>
            {currentIndex > 0 ? (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-background"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={goNext}
              disabled={!canContinue}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {isReview ? "Done" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

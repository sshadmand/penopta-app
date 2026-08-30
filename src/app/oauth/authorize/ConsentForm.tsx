"use client";

import { useActionState, useEffect } from "react";

import { approveAuthorization, type ConsentState } from "@/lib/oauth/actions";

type Props = {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
};

const initialState: ConsentState = { error: null, redirectTo: null };

/**
 * Consent buttons. Approving mints a code server-side and returns the callback
 * URL, which we navigate to with a top-level GET (`window.location.assign`) so
 * loopback/native clients (Codex, Claude, ChatGPT) reliably catch the code —
 * this avoids the 307 redirect some clients reject.
 */
export function ConsentForm({
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
  codeChallengeMethod,
  resource,
}: Props) {
  const [formState, formAction, isPending] = useActionState(
    approveAuthorization,
    initialState,
  );

  useEffect(() => {
    if (formState.redirectTo) {
      window.location.assign(formState.redirectTo);
    }
  }, [formState.redirectTo]);

  function deny() {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    window.location.assign(url.toString());
  }

  const redirecting = Boolean(formState.redirectTo);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="redirect_uri" value={redirectUri} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="state" value={state} />
      <input type="hidden" name="code_challenge" value={codeChallenge} />
      <input
        type="hidden"
        name="code_challenge_method"
        value={codeChallengeMethod}
      />
      <input type="hidden" name="resource" value={resource} />

      {formState.error ? (
        <p className="text-sm text-danger">{formState.error}</p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={deny}
          disabled={isPending || redirecting}
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
        >
          Deny
        </button>
        <button
          type="submit"
          disabled={isPending || redirecting}
          className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {redirecting ? "Redirecting…" : isPending ? "Approving…" : "Approve"}
        </button>
      </div>
    </form>
  );
}

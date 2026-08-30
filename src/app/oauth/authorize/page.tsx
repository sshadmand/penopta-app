import { redirect } from "next/navigation";

import { BrandIcon } from "@/components/Brand";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { getClient, isValidRedirectUri } from "@/lib/oauth/clients";
import { MCP_SCOPE } from "@/lib/oauth/config";

import { ConsentForm } from "./ConsentForm";

type AuthorizeParams = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  resource?: string;
};

const AUTHORIZE_PARAM_KEYS: (keyof AuthorizeParams)[] = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "state",
  "resource",
];

function buildReturnTo(params: AuthorizeParams): string {
  const qs = new URLSearchParams();
  for (const key of AUTHORIZE_PARAM_KEYS) {
    const value = params[key];
    if (value) qs.set(key, value);
  }
  return `/oauth/authorize?${qs.toString()}`;
}

function appendError(
  redirectUri: string,
  error: string,
  state?: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <BrandIcon className="mx-auto" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted">{detail}</p>
      </div>
    </main>
  );
}

/**
 * OAuth authorization endpoint (consent screen). Requires a Better Auth session;
 * this page only lets the signed-in user approve a connector, after which an
 * authorization code is issued to its redirect URI.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<AuthorizeParams>;
}) {
  const params = await searchParams;

  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  if (!clientId || !redirectUri) {
    return (
      <ErrorCard
        title="Invalid authorization request"
        detail="Missing client_id or redirect_uri."
      />
    );
  }

  const client = await getClient(clientId);
  if (!client || !isValidRedirectUri(client, redirectUri)) {
    return (
      <ErrorCard
        title="Unrecognized application"
        detail="This client isn't registered, or its redirect URI doesn't match. Nothing was shared."
      />
    );
  }

  // From here the redirect URI is trusted, so protocol errors go back to it.
  if (params.response_type !== "code") {
    redirect(
      appendError(redirectUri, "unsupported_response_type", params.state),
    );
  }
  if (
    !params.code_challenge ||
    (params.code_challenge_method ?? "S256") !== "S256"
  ) {
    redirect(appendError(redirectUri, "invalid_request", params.state));
  }

  const session = await getSession();
  if (!session) {
    redirect(loginStartHref(buildReturnTo(params)));
  }

  const scope = params.scope || MCP_SCOPE;
  const appName = client.clientName || "An application";

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <BrandIcon className="mx-auto" />
        <h1 className="mt-4 text-center text-lg font-semibold text-foreground">
          Connect {appName} to Penopta
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          Signed in as{" "}
          <span className="font-medium text-foreground">
            {session!.user.email}
          </span>
        </p>

        <div className="mt-6 rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">
            {appName} will be able to:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>
              • Read your workgroups and their linked conversation threads
            </li>
            <li>• Search your threads and read their full context</li>
          </ul>
          <p className="mt-3 text-xs text-muted">
            Read-only. Acts within your currently active organization. You can
            revoke access anytime.
          </p>
        </div>

        <ConsentForm
          clientId={clientId}
          redirectUri={redirectUri}
          scope={scope}
          state={params.state ?? ""}
          codeChallenge={params.code_challenge ?? ""}
          codeChallengeMethod={params.code_challenge_method ?? "S256"}
          resource={params.resource ?? ""}
        />
      </div>
    </main>
  );
}

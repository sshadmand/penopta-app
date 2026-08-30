"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { DotGridBackground } from "@/components/DotGridBackground";
import { ThemeCycleButton } from "@/components/ThemeToggle";
import { authClient } from "@/lib/auth/client";
import { isPenoptaMacApp, useIsPenoptaMacApp } from "@/lib/auth/native-shell";
import {
  isMacosAppReviewReturnTo,
  postSignInHref,
} from "@/lib/auth/post-sign-in-url";

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

function PasskeyMark() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 fill-current">
      <path
        fillRule="evenodd"
        d="M16.6945 12.1334C16.3969 12.3459 16.3035 12.792 16.562 13.0505C16.8653 13.3538 16.8653 13.8454 16.562 14.1487L16.4444 14.2663C16.0763 14.6345 16.0763 15.2314 16.4444 15.5996C16.8126 15.9678 16.8126 16.5647 16.4444 16.9329L15.6869 17.6905C15.4916 17.8858 15.175 17.8858 14.9798 17.6905L13.8484 16.5592C13.6609 16.3716 13.5556 16.1173 13.5556 15.8521V12.4113C12.5045 11.912 11.7778 10.8407 11.7778 9.59961C11.7778 7.88139 13.1707 6.48849 14.8889 6.48849C16.6071 6.48849 18 7.88139 18 9.59961C18 10.6446 17.4848 11.5693 16.6945 12.1334ZM14.8889 8.26627C15.3798 8.26627 15.7778 8.66424 15.7778 9.15516C15.7778 9.64608 15.3798 10.044 14.8889 10.044C14.398 10.044 14 9.64608 14 9.15516C14 8.66424 14.398 8.26627 14.8889 8.26627Z"
      />
      <path d="M10.7017 11.0931C10.0031 10.9296 9.1829 10.8342 8.22222 10.8342C3.16667 10.8342 2 13.4757 2 14.7848C2 16.0939 3.04467 17.1552 4.33333 17.1552H12.1111C12.1484 17.1552 12.1854 17.1543 12.2222 17.1525V13.1552C11.5324 12.637 10.9975 11.9221 10.7017 11.0931Z" />
      <path d="M8 9C9.65685 9 11 7.65685 11 6C11 4.34315 9.65685 3 8 3C6.34315 3 5 4.34315 5 6C5 7.65685 6.34315 9 8 9Z" />
    </svg>
  );
}

function isCancelledAuthError(
  message: string | null | undefined,
  code?: string,
) {
  if (code === "AUTH_CANCELLED") return true;
  return /cancel/i.test(message ?? "");
}

/**
 * Logged-out home. Google / GitHub OAuth + passkey via Better Auth.
 */
export function SignInCard({
  returnTo,
  errorMessage,
}: {
  returnTo?: string;
  errorMessage?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewPassword, setReviewPassword] = useState("");
  const [reviewPending, setReviewPending] = useState(false);
  const macApp = useIsPenoptaMacApp();
  const destination =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/";
  const afterAuthHref = postSignInHref(destination);
  const appReview = isMacosAppReviewReturnTo(destination);

  useEffect(() => {
    if (errorMessage && isCancelledAuthError(errorMessage)) {
      toast.error(errorMessage);
    }
  }, [errorMessage]);

  useEffect(() => {
    // WKWebView cannot run conditional passkey UI. Starting it here aborts
    // the real “Continue with Passkey” click with “Auth cancelled”.
    // Safari (including the Mac app’s sign-in sheet) does not set this flag.
    if (isPenoptaMacApp() || appReview) return;
    if (
      typeof window === "undefined" ||
      !window.PublicKeyCredential?.isConditionalMediationAvailable
    ) {
      return;
    }
    void PublicKeyCredential.isConditionalMediationAvailable().then(
      (available) => {
        if (!available) return;
        void authClient.signIn.passkey({
          autoFill: true,
          fetchOptions: {
            onSuccess() {
              startTransition(() => {
                router.replace(afterAuthHref);
                router.refresh();
              });
            },
          },
        });
      },
    );
  }, [afterAuthHref, appReview, router]);

  async function continueWithReviewAccount() {
    setLocalError(null);
    setReviewPending(true);
    try {
      const { error } = await authClient.signIn.email({
        email: reviewEmail.trim(),
        password: reviewPassword,
        rememberMe: false,
      });
      if (error) {
        setLocalError("The review email or password is incorrect.");
        return;
      }

      // This is a server-side redirect to the macOS callback. Using the App
      // Router plus an immediate refresh can leave the forced login screen in
      // place even after Better Auth set the session cookie.
      window.location.assign(afterAuthHref);
    } catch {
      setLocalError("Couldn’t complete reviewer sign-in. Please try again.");
    } finally {
      setReviewPending(false);
    }
  }

  async function continueWithGoogle() {
    setLocalError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: afterAuthHref,
    });
    if (error) {
      setLocalError(error.message || "Google sign-in failed. Try again.");
    }
  }

  async function continueWithGitHub() {
    setLocalError(null);
    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL: afterAuthHref,
    });
    if (error) {
      setLocalError(error.message || "GitHub sign-in failed. Try again.");
    }
  }

  async function continueWithPasskey() {
    setLocalError(null);
    const { error } = await authClient.signIn.passkey({
      fetchOptions: {
        onSuccess() {
          startTransition(() => {
            router.replace(afterAuthHref);
            router.refresh();
          });
        },
      },
    });
    if (error) {
      const cancelled = isCancelledAuthError(
        error.message,
        "code" in error ? error.code : undefined,
      );
      const message =
        isPenoptaMacApp() && cancelled
          ? "Passkeys don’t work in the Mac app. Use Google or GitHub, or open this site in Safari to use a passkey."
          : error.message ||
            "Passkey sign-in failed. Sign in with Google or GitHub first, then add a passkey.";
      if (cancelled) {
        toast.error(message);
        return;
      }
      setLocalError(message);
    }
  }

  const shownError =
    localError ||
    (errorMessage && !isCancelledAuthError(errorMessage) ? errorMessage : null);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <DotGridBackground />
      <div className="absolute top-4 right-4 z-10">
        <ThemeCycleButton />
      </div>

      <div className="relative w-full max-w-100 rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-center text-[1.375rem] font-semibold tracking-tight text-foreground">
          {appReview ? "Penopta App Review" : "Welcome to Penopta"}
        </h1>

        {shownError ? (
          <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {shownError}
          </p>
        ) : null}

        <p className="mt-2 text-center text-sm text-muted">
          {appReview
            ? "Sign in with the reviewer credentials supplied in App Store Connect."
            : "Continue to register or sign in."}
        </p>

        {appReview ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void continueWithReviewAccount();
            }}
          >
            <label className="block text-sm font-medium text-foreground">
              Email
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={reviewEmail}
                onChange={(event) => setReviewEmail(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={reviewPassword}
                onChange={(event) => setReviewPassword(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
              />
            </label>
            <button
              type="submit"
              disabled={
                pending ||
                reviewPending ||
                !reviewEmail.trim() ||
                !reviewPassword
              }
              className="flex h-11 w-full items-center justify-center rounded-lg bg-foreground text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
            >
              {reviewPending ? "Signing in…" : "Sign in for review"}
            </button>
          </form>
        ) : (
          <>
            {/* Conditional UI hint for passkey autofill */}
            <input
              type="text"
              name="username"
              autoComplete="username webauthn"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />

            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => void continueWithGoogle()}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
              >
                <GoogleMark />
                Continue with Google
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => void continueWithGitHub()}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
              >
                <GitHubMark />
                Continue with GitHub
              </button>

              {macApp ? null : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void continueWithPasskey()}
                  className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
                >
                  <PasskeyMark />
                  Continue with Passkey
                </button>
              )}
            </div>
          </>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          <a
            href="https://penopta.com/privacy"
            className="underline-offset-2 transition hover:text-foreground hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy
          </a>
          <span className="mx-1.5" aria-hidden>
            ·
          </span>
          <a
            href="https://penopta.com/terms"
            className="underline-offset-2 transition hover:text-foreground hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms
          </a>
        </p>
      </div>
    </main>
  );
}

import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getPublicAppUrl } from "@/lib/integrations/providers";

/** Auth base URL — same as APP_URL unless BETTER_AUTH_URL is set explicitly. */
function authBaseUrl(): string {
  const override = process.env.BETTER_AUTH_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  return getPublicAppUrl();
}

function passkeyRpId(): string {
  const explicit = process.env.PASSKEY_RP_ID?.trim();
  if (explicit) return explicit;
  try {
    const host = new URL(authBaseUrl()).hostname;
    return host === "127.0.0.1" ? "localhost" : host;
  } catch {
    return "localhost";
  }
}

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const githubClientId = process.env.GITHUB_CLIENT_ID?.trim();
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();

function normalizedReviewEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export const auth = betterAuth({
  appName: "Penopta",
  baseURL: authBaseUrl(),
  secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      passkey: schema.passkey,
    },
  }),
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
    ...(githubClientId && githubClientSecret
      ? {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
          },
        }
      : {}),
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/sign-in/email") return;

      const configuredEmail = normalizedReviewEmail(
        process.env.APP_REVIEW_DEMO_EMAIL,
      );
      const submittedEmail = normalizedReviewEmail(
        (context.body as { email?: unknown } | undefined)?.email,
      );

      if (!configuredEmail || submittedEmail !== configuredEmail) {
        throw APIError.from("UNAUTHORIZED", {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Invalid email or password",
        });
      }
    }),
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
    },
  },
  plugins: [
    passkey({
      rpID: passkeyRpId(),
      rpName: "Penopta",
      origin: authBaseUrl(),
    }),
    nextCookies(),
  ],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
});

export type AuthSession = typeof auth.$Infer.Session;

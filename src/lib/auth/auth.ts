import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { importPKCS8, SignJWT } from "jose";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { purgeAccountData } from "@/lib/auth/account-deletion";
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
const appleClientId = process.env.APPLE_CLIENT_ID?.trim();
const appleTeamId = process.env.APPLE_TEAM_ID?.trim();
const appleKeyId = process.env.APPLE_KEY_ID?.trim();
const applePrivateKey = process.env.APPLE_PRIVATE_KEY?.trim();

function normalizeApplePrivateKey(value: string | undefined): string | null {
  if (!value) return null;

  const normalized = value.replace(/\\n/g, "\n").trim();
  const pemPattern =
    /^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PRIVATE KEY-----$/;

  return pemPattern.test(normalized) ? normalized : null;
}

const normalizedApplePrivateKey = normalizeApplePrivateKey(applePrivateKey);

/** Apple requires an ES256 JWT client secret, valid for no more than six months. */
async function appleClientSecret(): Promise<string> {
  if (!appleClientId || !appleTeamId || !appleKeyId || !normalizedApplePrivateKey) {
    throw new Error("Apple Sign In is not configured.");
  }

  const key = await importPKCS8(normalizedApplePrivateKey, "ES256");
  const now = Math.floor(Date.now() / 1_000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: appleKeyId })
    .setIssuer(appleTeamId)
    .setSubject(appleClientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key);
}

const appleIsConfigured = Boolean(
  appleClientId && appleTeamId && appleKeyId && normalizedApplePrivateKey,
);

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
    ...(appleIsConfigured
      ? {
          apple: async () => ({
            clientId: appleClientId!,
            clientSecret: await appleClientSecret(),
            appBundleIdentifier: "com.penopta.Penopta-Sync",
          }),
        }
      : {}),
  },
  trustedOrigins: ["https://appleid.apple.com"],
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
      trustedProviders: ["google", "github", "apple"],
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await purgeAccountData(user.id);
      },
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

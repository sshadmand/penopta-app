/** Mac app bundle id. Native Sign in with Apple tokens use this as `aud`. */
export const MACOS_APP_BUNDLE_ID = "com.penopta.Penopta-Sync";

/**
 * Better Auth treats `clientId[0]` as the web Services ID (authorize + token
 * exchange) and later entries as extra ID-token audiences. Native Apple
 * tokens use the Mac bundle id, so both must be accepted. Do not set
 * `appBundleIdentifier` — that replaces the Services ID audience and rejects
 * website Sign in with Apple.
 */
export function appleAcceptedClientIds(
  servicesId: string,
  bundleId: string,
): string[] {
  const extra = bundleId.trim();
  if (!extra || extra === servicesId) return [servicesId];
  return [servicesId, extra];
}

export function nativeAppleSignInBody(input: {
  identityToken: string;
  nonce?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}) {
  const givenName = input.givenName?.trim() || undefined;
  const familyName = input.familyName?.trim() || undefined;
  const email = input.email?.trim() || undefined;
  const nonce = input.nonce?.trim() || undefined;

  return {
    provider: "apple" as const,
    disableRedirect: true as const,
    idToken: {
      token: input.identityToken,
      ...(nonce ? { nonce } : {}),
      ...(email || givenName || familyName
        ? {
            user: {
              ...(email ? { email } : {}),
              ...(givenName || familyName
                ? {
                    name: {
                      ...(givenName ? { firstName: givenName } : {}),
                      ...(familyName ? { lastName: familyName } : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
    },
  };
}

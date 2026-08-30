/** Welcome onboarding is unfinished; only mount it in local `next dev`. */
export function isWelcomeOnboardingEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

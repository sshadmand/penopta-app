import type { IntegrationProviderId } from "@/lib/integrations/providers";
import { isPrivateProjectName } from "@/lib/ingest/data";

/** Providers that can discover projects into the available catalog. */
export const PROVIDER_PROJECT_PROVIDERS = [
  "chatgpt",
  "claude",
  "cursor",
] as const;

export type ProviderProjectProvider = (typeof PROVIDER_PROJECT_PROVIDERS)[number];

export function isProviderProjectProvider(
  value: string,
): value is ProviderProjectProvider {
  return (PROVIDER_PROJECT_PROVIDERS as readonly string[]).includes(value);
}

/** Same rule as ingest / sync skill — never catalog or sync these. */
export function isPrivateProviderProjectName(name: string): boolean {
  return isPrivateProjectName(name);
}

/** Narrow IntegrationProviderId to catalog providers (they are the same set). */
export function asProviderProjectProvider(
  id: IntegrationProviderId,
): ProviderProjectProvider {
  return id;
}

/** Canonical in-app path for the integrations settings section. */
export const INTEGRATIONS_PATH = "/settings/integrations";

/** `/settings/integrations` or `/settings/integrations/{slug}`. */
export function integrationPath(slug?: string): string {
  return slug ? `${INTEGRATIONS_PATH}/${slug}` : INTEGRATIONS_PATH;
}

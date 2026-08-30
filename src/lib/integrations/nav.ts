import { integrationPath } from "@/lib/integrations/paths";

/** A top-level settings destination. */
export type IntegrationNavGroup = {
  id: string;
  name: string;
  href: string;
};

/** The sidebar intentionally exposes category pages, not their detail views. */
export function listIntegrationNav(): IntegrationNavGroup[] {
  return [
    {
      id: "agents-ides",
      name: "Agents/IDEs",
      href: integrationPath(),
    },
    {
      id: "applications",
      name: "Applications",
      href: `${integrationPath()}?section=applications`,
    },
    {
      id: "mcp-tools",
      name: "MCP Tools",
      href: integrationPath("mcp"),
    },
    {
      id: "llm-keys",
      name: "LLM Keys",
      href: integrationPath("ai"),
    },
  ];
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SettingsShell } from "@/components/SettingsShell";
import { listIntegrationNav } from "@/lib/integrations/nav";

export const metadata: Metadata = {
  title: "Account and Settings",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const integrationNav = listIntegrationNav();
  return (
    <SettingsShell integrationNav={integrationNav}>{children}</SettingsShell>
  );
}

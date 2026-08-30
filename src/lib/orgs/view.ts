import type { OrgSwitcherItem } from "@/components/OrgSwitcher";
import type { OrgWithRole } from "@/lib/orgs/data";

/** Map membership rows to the shape the sidebar org switcher expects. */
export function toOrgSwitcherItems(
  memberships: OrgWithRole[],
): OrgSwitcherItem[] {
  return memberships.map(({ org, role }) => ({
    id: org.id,
    name: org.name,
    role,
    isPersonal: org.isPersonal,
  }));
}

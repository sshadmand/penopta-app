import { randomUUID, createHash } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  organizationMemberships,
  organizations,
  userActiveOrgs,
  type OrganizationMembershipRow,
  type OrganizationRow,
} from "@/lib/db/schema";

export type OrgRole = "owner" | "member";

/** An org paired with the viewer's role in it. */
export interface OrgWithRole {
  org: OrganizationRow;
  role: OrgRole;
}

/** The org a user is acting in, plus their role and everything they belong to. */
export interface ActiveOrgContext {
  activeOrg: OrganizationRow;
  role: OrgRole;
  memberships: OrgWithRole[];
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "org";
}

function personalSlug(userId: string): string {
  return `personal-${createHash("md5").update(userId).digest("hex").slice(0, 12)}`;
}

/** Every org the user belongs to, personal orgs first, then by name. */
export async function listUserOrgs(userId: string): Promise<OrgWithRole[]> {
  const rows = await db
    .select({ org: organizations, role: organizationMemberships.role })
    .from(organizationMemberships)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMemberships.orgId),
    )
    .where(eq(organizationMemberships.userId, userId))
    .orderBy(desc(organizations.isPersonal), asc(organizations.name));

  return rows.map((r) => ({ org: r.org, role: r.role as OrgRole }));
}

/** The viewer's role in an org, or null when they are not a member. */
export async function getMembershipRole(
  orgId: string,
  userId: string,
): Promise<OrgRole | null> {
  const rows = await db
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.orgId, orgId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .limit(1);

  return (rows[0]?.role as OrgRole) ?? null;
}

/** Members of an org (owners first), for the members panel. */
export async function listOrgMembers(
  orgId: string,
): Promise<OrganizationMembershipRow[]> {
  return db
    .select()
    .from(organizationMemberships)
    .where(eq(organizationMemberships.orgId, orgId))
    .orderBy(desc(organizationMemberships.role), asc(organizationMemberships.createdAt));
}

/** Fetch an org by id, or null when missing. */
export async function getOrgById(
  orgId: string,
): Promise<OrganizationRow | null> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Ensure a user has a personal org and returns it. Safe to call concurrently:
 * the personal slug is deterministic, so inserts collapse via ON CONFLICT.
 */
export async function ensurePersonalOrg(
  userId: string,
): Promise<OrganizationRow> {
  const slug = personalSlug(userId);

  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  let org = existing[0];
  if (!org) {
    const inserted = await db
      .insert(organizations)
      .values({ slug, name: "Personal", createdByUserId: userId, isPersonal: true })
      .onConflictDoNothing({ target: organizations.slug })
      .returning();
    org =
      inserted[0] ??
      (
        await db
          .select()
          .from(organizations)
          .where(eq(organizations.slug, slug))
          .limit(1)
      )[0];
  }

  if (!org) throw new Error("Failed to ensure personal org");

  await db
    .insert(organizationMemberships)
    .values({ orgId: org.id, userId, role: "owner" })
    .onConflictDoNothing({
      target: [organizationMemberships.orgId, organizationMemberships.userId],
    });

  return org;
}

/** Create a new org owned by `createdByUserId` and add them as owner. */
export async function createOrg(
  name: string,
  createdByUserId: string,
): Promise<OrganizationRow> {
  const trimmed = name.trim();
  let slug = slugify(trimmed);

  const clash = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (clash.length > 0) slug = `${slug}-${randomUUID().slice(0, 6)}`;

  const [org] = await db
    .insert(organizations)
    .values({ slug, name: trimmed, createdByUserId, isPersonal: false })
    .returning();
  if (!org) throw new Error("Failed to create org");

  await db
    .insert(organizationMemberships)
    .values({ orgId: org.id, userId: createdByUserId, role: "owner" });

  return org;
}

/** Point the user's active org at `orgId` (caller must verify membership). */
export async function setActiveOrg(
  userId: string,
  orgId: string,
): Promise<void> {
  await db
    .insert(userActiveOrgs)
    .values({ userId, orgId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userActiveOrgs.userId,
      set: { orgId, updatedAt: new Date() },
    });
}

export class OrgNotFoundError extends Error {
  constructor() {
    super("Organization not found.");
    this.name = "OrgNotFoundError";
  }
}

export class LastOwnerError extends Error {
  constructor(message = "An organization needs at least one owner.") {
    super(message);
    this.name = "LastOwnerError";
  }
}

export class AlreadyMemberError extends Error {
  constructor() {
    super("That person is already a member.");
    this.name = "AlreadyMemberError";
  }
}

/** Rename an org (does not change the slug). */
export async function renameOrg(
  orgId: string,
  name: string,
): Promise<OrganizationRow> {
  const trimmed = name.trim();
  const [row] = await db
    .update(organizations)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning();
  if (!row) throw new OrgNotFoundError();
  return row;
}

/** Add an auth user to an org with the given role. */
export async function addOrgMember(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<OrganizationMembershipRow> {
  const existing = await getMembershipRole(orgId, userId);
  if (existing) throw new AlreadyMemberError();

  const [row] = await db
    .insert(organizationMemberships)
    .values({ orgId, userId, role })
    .returning();
  if (!row) throw new Error("Failed to add member");
  return row;
}

/** Change a member's role. Refuses to demote the last owner. */
export async function updateOrgMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<OrganizationMembershipRow> {
  const current = await getMembershipRole(orgId, userId);
  if (!current) throw new OrgNotFoundError();

  if (current === "owner" && role === "member") {
    const owners = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.role, "owner"),
        ),
      );
    if (owners.length <= 1) throw new LastOwnerError();
  }

  const [row] = await db
    .update(organizationMemberships)
    .set({ role })
    .where(
      and(
        eq(organizationMemberships.orgId, orgId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .returning();
  if (!row) throw new OrgNotFoundError();
  return row;
}

/** Remove a member. Refuses to remove the last owner. */
export async function removeOrgMember(
  orgId: string,
  userId: string,
): Promise<void> {
  const current = await getMembershipRole(orgId, userId);
  if (!current) throw new OrgNotFoundError();

  if (current === "owner") {
    const owners = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.role, "owner"),
        ),
      );
    if (owners.length <= 1) throw new LastOwnerError();
  }

  await db
    .delete(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.orgId, orgId),
        eq(organizationMemberships.userId, userId),
      ),
    );
}

/**
 * Resolve the org the user is acting in. Guarantees a personal org exists,
 * validates that the stored active org is still a membership, and falls back
 * to the personal org otherwise.
 */
export async function resolveActiveOrg(
  userId: string,
): Promise<ActiveOrgContext> {
  const personal = await ensurePersonalOrg(userId);
  const memberships = await listUserOrgs(userId);

  const stored = await db
    .select({ orgId: userActiveOrgs.orgId })
    .from(userActiveOrgs)
    .where(eq(userActiveOrgs.userId, userId))
    .limit(1);

  const storedId = stored[0]?.orgId ?? null;
  const match = storedId
    ? memberships.find((m) => m.org.id === storedId)
    : undefined;

  if (match) {
    return { activeOrg: match.org, role: match.role, memberships };
  }

  // No valid stored active org — default to personal and persist it.
  await setActiveOrg(userId, personal.id);
  const personalRole =
    memberships.find((m) => m.org.id === personal.id)?.role ?? "owner";
  return { activeOrg: personal, role: personalRole, memberships };
}

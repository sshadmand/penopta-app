import { and, eq, ne, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  agentSyncRuns,
  agentThreadSnapshots,
  agentThreads,
  availableProviderProjects,
  hostSyncDeviceLogins,
  hostSyncTokens,
  oauthAuthorizationCodes,
  oauthTokens,
  organizationMemberships,
  organizations,
  projectChatMessages,
  projects,
  projectSourceProjects,
  projectThreads,
  statsChatMessages,
  syncSkillSightings,
  userActiveOrgs,
  userApiKeys,
  verification,
} from "@/lib/db/schema";

/**
 * Removes application data for a Better Auth user before Better Auth removes
 * their identity, sessions, social accounts, and passkeys. Shared workspaces
 * remain available to their other members; the departing user's own content
 * and membership are removed.
 */
export async function purgeAccountData(userId: string): Promise<void> {
  // Production uses Neon's HTTP driver, which intentionally does not support
  // interactive transactions. Keep this compatible with both local Postgres
  // and production by performing the ordered deletes directly.
  {
    const tx = db;
    const memberships = await tx
      .select({
        orgId: organizationMemberships.orgId,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, userId));

    const personalOrgs = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.createdByUserId, userId),
          eq(organizations.isPersonal, true),
        ),
      );

    const personalOrgIds = new Set(personalOrgs.map((org) => org.id));
    const orgIdsToDelete = new Set(personalOrgIds);

    // A workspace with no other members contains only this account's data, so
    // delete it outright. In an active shared workspace, retain the workspace
    // and promote another member if this account was its sole owner.
    for (const membership of memberships) {
      if (personalOrgIds.has(membership.orgId)) continue;

      const remainingMembers = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.orgId, membership.orgId),
            ne(organizationMemberships.userId, userId),
          ),
        )
        .limit(1);

      if (remainingMembers.length === 0) {
        orgIdsToDelete.add(membership.orgId);
        continue;
      }

      if (membership.role === "owner") {
        const successorId = remainingMembers[0]!.userId;
        await tx
          .update(organizationMemberships)
          .set({ role: "owner" })
          .where(
            and(
              eq(organizationMemberships.orgId, membership.orgId),
              eq(organizationMemberships.userId, successorId),
            ),
          );
      }

      await tx
        .update(organizations)
        .set({
          createdByUserId: remainingMembers[0]!.userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizations.id, membership.orgId),
            eq(organizations.createdByUserId, userId),
          ),
        );
    }

    for (const orgId of orgIdsToDelete) {
      // These tables deliberately use no-action org foreign keys so normal
      // multi-tenant reads cannot accidentally erase a workspace. Clear them
      // explicitly before deleting a wholly-owned workspace.
      await tx
        .delete(projectChatMessages)
        .where(eq(projectChatMessages.orgId, orgId));
      await tx.delete(projectThreads).where(eq(projectThreads.orgId, orgId));
      await tx
        .delete(projectSourceProjects)
        .where(eq(projectSourceProjects.orgId, orgId));
      await tx
        .delete(statsChatMessages)
        .where(eq(statsChatMessages.orgId, orgId));
      await tx
        .delete(agentThreadSnapshots)
        .where(eq(agentThreadSnapshots.orgId, orgId));
      await tx.delete(agentThreads).where(eq(agentThreads.orgId, orgId));
      await tx.delete(agentSyncRuns).where(eq(agentSyncRuns.orgId, orgId));
      await tx.delete(projects).where(eq(projects.orgId, orgId));
      await tx
        .delete(availableProviderProjects)
        .where(eq(availableProviderProjects.orgId, orgId));
      await tx.delete(userApiKeys).where(eq(userApiKeys.orgId, orgId));
      await tx
        .delete(hostSyncDeviceLogins)
        .where(eq(hostSyncDeviceLogins.orgId, orgId));
      await tx.delete(hostSyncTokens).where(eq(hostSyncTokens.orgId, orgId));
      await tx
        .delete(syncSkillSightings)
        .where(eq(syncSkillSightings.orgId, orgId));
      await tx.delete(organizations).where(eq(organizations.id, orgId));
    }

    // Clear data this user owns or authored in any shared workspace that
    // remains. Cascades cover the dependent project/thread join rows.
    await tx.delete(projects).where(eq(projects.ownerUserId, userId));
    await tx
      .delete(projectChatMessages)
      .where(eq(projectChatMessages.authorUserId, userId));
    await tx
      .delete(projectThreads)
      .where(eq(projectThreads.addedByUserId, userId));
    await tx
      .delete(projectSourceProjects)
      .where(eq(projectSourceProjects.addedByUserId, userId));
    await tx
      .delete(statsChatMessages)
      .where(
        or(
          eq(statsChatMessages.ownerUserId, userId),
          eq(statsChatMessages.authorUserId, userId),
        ),
      );
    await tx
      .delete(availableProviderProjects)
      .where(eq(availableProviderProjects.ownerUserId, userId));
    await tx
      .delete(agentThreadSnapshots)
      .where(eq(agentThreadSnapshots.ownerUserId, userId));
    await tx.delete(agentThreads).where(eq(agentThreads.ownerUserId, userId));
    await tx.delete(agentSyncRuns).where(eq(agentSyncRuns.ownerUserId, userId));
    await tx.delete(userApiKeys).where(eq(userApiKeys.ownerUserId, userId));
    await tx
      .delete(hostSyncDeviceLogins)
      .where(eq(hostSyncDeviceLogins.ownerUserId, userId));
    await tx
      .delete(hostSyncTokens)
      .where(eq(hostSyncTokens.ownerUserId, userId));
    await tx
      .delete(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.userId, userId));
    await tx.delete(oauthTokens).where(eq(oauthTokens.userId, userId));
    await tx.delete(verification).where(eq(verification.value, userId));
    await tx.delete(userActiveOrgs).where(eq(userActiveOrgs.userId, userId));
    await tx
      .delete(organizationMemberships)
      .where(eq(organizationMemberships.userId, userId));
  }
}

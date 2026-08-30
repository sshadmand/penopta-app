/**
 * Seeds a sample public project (in a seed org) so the home page has data.
 * Idempotent: skips if a project with the same slug already exists.
 *
 * Run with: npm run db:seed
 */
import { eq } from "drizzle-orm";

import { db } from "./client";
import { organizationMemberships, organizations, projects } from "./schema";

const SEED_OWNER = "seed";
const SEED_ORG_SLUG = "personal-seed";

async function ensureSeedOrg(): Promise<string> {
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, SEED_ORG_SLUG))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [org] = await db
    .insert(organizations)
    .values({
      slug: SEED_ORG_SLUG,
      name: "Personal",
      createdByUserId: SEED_OWNER,
      isPersonal: true,
    })
    .returning({ id: organizations.id });

  await db
    .insert(organizationMemberships)
    .values({ orgId: org.id, userId: SEED_OWNER, role: "owner" })
    .onConflictDoNothing();

  return org.id;
}

async function main() {
  const slug = "welcome";

  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Project "${slug}" already exists — nothing to seed.`);
    return;
  }

  const orgId = await ensureSeedOrg();

  await db.insert(projects).values({
    slug,
    name: "Welcome to Penopta",
    summary:
      "A starter project proving Postgres + Drizzle + Better Auth are wired.",
    orgId,
    ownerUserId: SEED_OWNER,
    visibility: "public",
  });

  console.log(`Seeded project "${slug}" (public) in the seed org.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

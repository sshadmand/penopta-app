CREATE TABLE "organization_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"is_personal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_active_org" (
	"user_id" text PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add org_id as nullable first so existing rows can be backfilled.
ALTER TABLE "agent_sync_run" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_thread_snapshot" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_thread" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "user_api_key" ADD COLUMN "org_id" uuid;--> statement-breakpoint
-- Backfill: one personal org per existing owner across all owned tables.
INSERT INTO "organization" ("slug", "name", "created_by_user_id", "is_personal")
SELECT 'personal-' || left(md5(o.owner_user_id), 12), 'Personal', o.owner_user_id, true
FROM (
	SELECT DISTINCT "owner_user_id" FROM "project"
	UNION SELECT DISTINCT "owner_user_id" FROM "user_api_key"
	UNION SELECT DISTINCT "owner_user_id" FROM "agent_sync_run"
	UNION SELECT DISTINCT "owner_user_id" FROM "agent_thread"
	UNION SELECT DISTINCT "owner_user_id" FROM "agent_thread_snapshot"
) o
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
INSERT INTO "organization_membership" ("org_id", "user_id", "role")
SELECT "id", "created_by_user_id", 'owner' FROM "organization" WHERE "is_personal" = true;--> statement-breakpoint
INSERT INTO "user_active_org" ("user_id", "org_id")
SELECT "created_by_user_id", "id" FROM "organization" WHERE "is_personal" = true
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint
UPDATE "project" p SET "org_id" = org."id"
FROM "organization" org WHERE org."is_personal" = true AND org."created_by_user_id" = p."owner_user_id" AND p."org_id" IS NULL;--> statement-breakpoint
UPDATE "user_api_key" k SET "org_id" = org."id"
FROM "organization" org WHERE org."is_personal" = true AND org."created_by_user_id" = k."owner_user_id" AND k."org_id" IS NULL;--> statement-breakpoint
UPDATE "agent_sync_run" r SET "org_id" = org."id"
FROM "organization" org WHERE org."is_personal" = true AND org."created_by_user_id" = r."owner_user_id" AND r."org_id" IS NULL;--> statement-breakpoint
UPDATE "agent_thread" t SET "org_id" = org."id"
FROM "organization" org WHERE org."is_personal" = true AND org."created_by_user_id" = t."owner_user_id" AND t."org_id" IS NULL;--> statement-breakpoint
UPDATE "agent_thread_snapshot" s SET "org_id" = org."id"
FROM "organization" org WHERE org."is_personal" = true AND org."created_by_user_id" = s."owner_user_id" AND s."org_id" IS NULL;--> statement-breakpoint
-- Enforce NOT NULL now that every row is backfilled.
ALTER TABLE "agent_sync_run" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_thread_snapshot" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_thread" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_api_key" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_active_org" ADD CONSTRAINT "user_active_org_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_membership_org_user_uidx" ON "organization_membership" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_membership_user_idx" ON "organization_membership" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "agent_sync_run" ADD CONSTRAINT "agent_sync_run_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_thread_snapshot" ADD CONSTRAINT "agent_thread_snapshot_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_thread" ADD CONSTRAINT "agent_thread_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_key" ADD CONSTRAINT "user_api_key_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sync_run_org_created_idx" ON "agent_sync_run" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_thread_org_synced_idx" ON "agent_thread" USING btree ("org_id","last_synced_at");

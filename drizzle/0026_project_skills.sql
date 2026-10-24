CREATE TABLE "project_skill_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"updated_by_user_id" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"human_edited" boolean DEFAULT false NOT NULL,
	"source_thread_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_user_id" text,
	"model" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "skill_distill_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "skills_distilled_through" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "skills_commit_to_repo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_skill_revision" ADD CONSTRAINT "project_skill_revision_skill_id_project_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."project_skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skill_revision" ADD CONSTRAINT "project_skill_revision_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skill" ADD CONSTRAINT "project_skill_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skill" ADD CONSTRAINT "project_skill_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_skill_revision_skill_version_uidx" ON "project_skill_revision" USING btree ("skill_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "project_skill_project_slug_uidx" ON "project_skill" USING btree ("project_id","slug");--> statement-breakpoint
CREATE INDEX "project_skill_project_status_idx" ON "project_skill" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "project_skill_org_idx" ON "project_skill" USING btree ("org_id");
CREATE TABLE "org_activity_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"slices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan_slices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_fingerprint" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_activity_thread" ADD CONSTRAINT "org_activity_thread_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_activity_thread_org_thread_uidx" ON "org_activity_thread" USING btree ("org_id","thread_id");--> statement-breakpoint
CREATE INDEX "org_activity_thread_org_idx" ON "org_activity_thread" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agent_thread_snapshot_org_thread_created_idx" ON "agent_thread_snapshot" USING btree ("org_id","thread_id","created_at");
CREATE TABLE "project_source_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"available_provider_project_id" uuid NOT NULL,
	"added_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_source_project" ADD CONSTRAINT "project_source_project_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_source_project" ADD CONSTRAINT "project_source_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_source_project" ADD CONSTRAINT "project_source_project_available_provider_project_id_available_provider_project_id_fk" FOREIGN KEY ("available_provider_project_id") REFERENCES "public"."available_provider_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_source_project_project_source_uidx" ON "project_source_project" USING btree ("project_id","available_provider_project_id");--> statement-breakpoint
CREATE INDEX "project_source_project_project_idx" ON "project_source_project" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_source_project_source_idx" ON "project_source_project" USING btree ("available_provider_project_id");
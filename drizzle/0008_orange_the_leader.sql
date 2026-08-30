CREATE TABLE "available_provider_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_project_id" text NOT NULL,
	"name" text NOT NULL,
	"project_created_at" timestamp with time zone,
	"tracked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "available_provider_project" ADD CONSTRAINT "available_provider_project_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "available_provider_project_org_provider_ext_uidx" ON "available_provider_project" USING btree ("org_id","provider","external_project_id");--> statement-breakpoint
CREATE INDEX "available_provider_project_org_provider_idx" ON "available_provider_project" USING btree ("org_id","provider");
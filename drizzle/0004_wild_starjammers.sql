CREATE TABLE "project_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_thread_id" uuid NOT NULL,
	"added_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_thread" ADD CONSTRAINT "project_thread_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_thread" ADD CONSTRAINT "project_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_thread" ADD CONSTRAINT "project_thread_agent_thread_id_agent_thread_id_fk" FOREIGN KEY ("agent_thread_id") REFERENCES "public"."agent_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_thread_project_thread_uidx" ON "project_thread" USING btree ("project_id","agent_thread_id");--> statement-breakpoint
CREATE INDEX "project_thread_project_idx" ON "project_thread" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_thread_thread_idx" ON "project_thread" USING btree ("agent_thread_id");
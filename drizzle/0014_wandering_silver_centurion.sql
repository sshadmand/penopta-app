CREATE TABLE "project_chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_user_id" text,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"meta" text,
	"is_error" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_chat_message" ADD CONSTRAINT "project_chat_message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_chat_message" ADD CONSTRAINT "project_chat_message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_chat_message_project_created_idx" ON "project_chat_message" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_chat_message_org_idx" ON "project_chat_message" USING btree ("org_id");
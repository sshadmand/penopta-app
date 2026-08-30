CREATE TABLE "stats_chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"author_user_id" text,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"meta" text,
	"is_error" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stats_chat_message" ADD CONSTRAINT "stats_chat_message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stats_chat_message_owner_created_idx" ON "stats_chat_message" USING btree ("org_id","owner_user_id","created_at");
CREATE TABLE "org_llm_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_last4" text NOT NULL,
	"model" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_llm_credential" ADD CONSTRAINT "org_llm_credential_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_llm_credential_org_provider_uidx" ON "org_llm_credential" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "org_llm_credential_org_idx" ON "org_llm_credential" USING btree ("org_id");
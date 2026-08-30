CREATE TABLE "host_sync_device_login" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_code" text NOT NULL,
	"device_code_hash" text NOT NULL,
	"kind" text NOT NULL,
	"hostname" text,
	"token_id" uuid,
	"owner_user_id" text,
	"org_id" uuid,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_sync_device_login_user_code_unique" UNIQUE("user_code"),
	CONSTRAINT "host_sync_device_login_device_code_hash_unique" UNIQUE("device_code_hash")
);
--> statement-breakpoint
CREATE TABLE "host_sync_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"hostname" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_sync_token_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "host_sync_device_login" ADD CONSTRAINT "host_sync_device_login_token_id_host_sync_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."host_sync_token"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_sync_device_login" ADD CONSTRAINT "host_sync_device_login_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_sync_token" ADD CONSTRAINT "host_sync_token_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_sync_device_login_status_expires_idx" ON "host_sync_device_login" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "host_sync_token_org_owner_idx" ON "host_sync_token" USING btree ("org_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "host_sync_token_owner_host_idx" ON "host_sync_token" USING btree ("owner_user_id","org_id","hostname");
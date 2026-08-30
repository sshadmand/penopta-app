ALTER TABLE "oauth_token" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD COLUMN "last_verified_agent" text;
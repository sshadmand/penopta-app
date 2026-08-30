ALTER TABLE "organization" ADD COLUMN "weekly_digest_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "weekly_digest_last_week_key" text;
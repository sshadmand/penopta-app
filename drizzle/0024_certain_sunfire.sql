ALTER TABLE "organization" ALTER COLUMN "weekly_digest_enabled" SET DEFAULT true;--> statement-breakpoint
UPDATE "organization"
SET "weekly_digest_enabled" = true
WHERE "daily_summary_enabled" = true
  AND "is_personal" = false;

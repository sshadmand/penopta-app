-- Better Auth 1.7 scopes accounts by (issuer, account_id). Add issuer as
-- nullable, backfill from the built-in providers this app uses, then enforce
-- NOT NULL + the compound unique index. Abort if a row cannot be mapped.
ALTER TABLE "account" ADD COLUMN "issuer" text;
--> statement-breakpoint
UPDATE "account"
SET "issuer" = CASE "provider_id"
	WHEN 'google' THEN 'https://accounts.google.com'
	WHEN 'github' THEN 'local:oauth:github'
	WHEN 'apple' THEN 'https://appleid.apple.com'
	WHEN 'credential' THEN 'local:credential'
	ELSE NULL
END
WHERE "issuer" IS NULL;
--> statement-breakpoint
DO $$
DECLARE
	unknown_providers text;
	collision_count integer;
BEGIN
	SELECT string_agg(provider_id, ', ' ORDER BY provider_id)
	INTO unknown_providers
	FROM (
		SELECT DISTINCT provider_id
		FROM account
		WHERE issuer IS NULL OR btrim(issuer) = ''
	) unknown_rows;

	IF unknown_providers IS NOT NULL THEN
		RAISE EXCEPTION 'better-auth 1.7: cannot backfill issuer for provider_id(s): %', unknown_providers;
	END IF;

	SELECT count(*) INTO collision_count
	FROM (
		SELECT 1
		FROM account
		GROUP BY issuer, account_id
		HAVING count(*) > 1
	) collisions;

	IF collision_count > 0 THEN
		RAISE EXCEPTION 'better-auth 1.7: % colliding (issuer, account_id) groups', collision_count;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");

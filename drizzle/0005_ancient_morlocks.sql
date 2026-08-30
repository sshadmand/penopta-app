CREATE TABLE "oauth_authorization_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"resource" text,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_authorization_code_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text,
	"redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grant_types" jsonb DEFAULT '["authorization_code","refresh_token"]'::jsonb NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
	"metadata_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"resource" text,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_token_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "oauth_token_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE INDEX "oauth_authorization_code_client_idx" ON "oauth_authorization_code" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_client_client_id_idx" ON "oauth_client" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_token_user_idx" ON "oauth_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_token_client_idx" ON "oauth_token" USING btree ("client_id");
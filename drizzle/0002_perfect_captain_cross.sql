CREATE TABLE "agent_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"agent_id" text NOT NULL,
	"run_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"agent_name" text NOT NULL,
	"agent_model" text NOT NULL,
	"agent_effort" text,
	"capture_coverage" jsonb,
	"run_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_thread_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"thread_created_at" timestamp with time zone,
	"thread_updated_at" timestamp with time zone,
	"project_context" text,
	"source_activity" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"working_state" jsonb,
	"agent_name" text NOT NULL,
	"agent_model" text NOT NULL,
	"agent_effort" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"thread_created_at" timestamp with time zone,
	"thread_updated_at" timestamp with time zone,
	"project_context" text,
	"source_activity" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"working_state" jsonb,
	"last_agent_name" text NOT NULL,
	"last_agent_model" text NOT NULL,
	"last_agent_effort" text,
	"last_agent_id" text NOT NULL,
	"last_run_id" text NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_thread_snapshot" ADD CONSTRAINT "agent_thread_snapshot_sync_run_id_agent_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."agent_sync_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sync_run_owner_run_uidx" ON "agent_sync_run" USING btree ("owner_user_id","run_id");--> statement-breakpoint
CREATE INDEX "agent_sync_run_owner_created_idx" ON "agent_sync_run" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_sync_run_owner_agent_name_idx" ON "agent_sync_run" USING btree ("owner_user_id","agent_name");--> statement-breakpoint
CREATE INDEX "agent_sync_run_owner_agent_model_idx" ON "agent_sync_run" USING btree ("owner_user_id","agent_model");--> statement-breakpoint
CREATE INDEX "agent_thread_snapshot_owner_thread_idx" ON "agent_thread_snapshot" USING btree ("owner_user_id","thread_id");--> statement-breakpoint
CREATE INDEX "agent_thread_snapshot_run_idx" ON "agent_thread_snapshot" USING btree ("sync_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_thread_owner_thread_uidx" ON "agent_thread" USING btree ("owner_user_id","thread_id");--> statement-breakpoint
CREATE INDEX "agent_thread_owner_agent_name_idx" ON "agent_thread" USING btree ("owner_user_id","last_agent_name");--> statement-breakpoint
CREATE INDEX "agent_thread_owner_agent_model_idx" ON "agent_thread" USING btree ("owner_user_id","last_agent_model");--> statement-breakpoint
CREATE INDEX "agent_thread_owner_kind_idx" ON "agent_thread" USING btree ("owner_user_id","kind");--> statement-breakpoint
CREATE INDEX "agent_thread_owner_status_idx" ON "agent_thread" USING btree ("owner_user_id","status");
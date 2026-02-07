CREATE TABLE "run_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"provider" text DEFAULT 'claude_sdk' NOT NULL,
	"provider_checkpoint_id" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_file_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"op" text NOT NULL,
	"path" text NOT NULL,
	"before_content_ref" text,
	"after_content_ref" text,
	"checkpoint_id" text,
	"tool_name" text,
	"tool_use_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"tool_name" text,
	"tool_use_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"detail" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DROP INDEX "todos__uniq";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "provider" text DEFAULT 'anthropic' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "content_ref" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "todo_id" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "step_id" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "artifact_id" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "file_path" text;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "checkpoint_id" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "run_checkpoints" ADD CONSTRAINT "run_checkpoints_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_file_ops" ADD CONSTRAINT "run_file_ops_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_checkpoints__uniq" ON "run_checkpoints" USING btree ("run_id","provider_checkpoint_id");--> statement-breakpoint
CREATE INDEX "run_checkpoints__run_idx" ON "run_checkpoints" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "run_file_ops__run_idx" ON "run_file_ops" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "run_file_ops__path_idx" ON "run_file_ops" USING btree ("run_id","path","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "run_steps__uniq" ON "run_steps" USING btree ("run_id","step_key");--> statement-breakpoint
CREATE INDEX "run_steps__run_idx" ON "run_steps" USING btree ("run_id","started_at");--> statement-breakpoint
CREATE INDEX "run_steps__status_idx" ON "run_steps" USING btree ("run_id","status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts__content_uniq" ON "artifacts" USING btree ("run_id","content_ref");--> statement-breakpoint
CREATE INDEX "run_events__type_idx" ON "run_events" USING btree ("run_id","type","seq");--> statement-breakpoint
CREATE INDEX "run_events__session_idx" ON "run_events" USING btree ("run_id","session_id","seq");--> statement-breakpoint
CREATE INDEX "run_events__step_idx" ON "run_events" USING btree ("run_id","step_id","seq");--> statement-breakpoint
CREATE INDEX "run_events__todo_idx" ON "run_events" USING btree ("run_id","todo_id","seq");--> statement-breakpoint
CREATE INDEX "run_events__file_idx" ON "run_events" USING btree ("run_id","file_path","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "todos__external_uniq" ON "todos" USING btree ("run_id","external_id");--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN "blob_key";
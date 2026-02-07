DROP INDEX "run_events__uniq";--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'runner' NOT NULL;
ALTER TABLE "run_events" ADD COLUMN IF NOT EXISTS "source_seq" integer DEFAULT 0 NOT NULL;
CREATE UNIQUE INDEX "run_events__uniq_seq" ON "run_events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "run_events__uniq_prod"
ON "run_events" USING btree ("run_id","source","source_seq");
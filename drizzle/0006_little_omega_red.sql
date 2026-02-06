-- drizzle/0006_little_omega_red.sql
-- Make this migration resilient to partial applies.

-- Needed for digest() backfill
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- run_files
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "run_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "content_ref" text NOT NULL,
  "path" text NOT NULL,
  "mode" text DEFAULT 'ro' NOT NULL,
  "sha256" text,
  "mime" text,
  "size" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_files_run_id_runs_id_fk'
  ) THEN
    ALTER TABLE "run_files"
      ADD CONSTRAINT "run_files_run_id_runs_id_fk"
      FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "run_files__run_idx" ON "run_files" USING btree ("run_id");
CREATE UNIQUE INDEX IF NOT EXISTS "run_files__uniq" ON "run_files" USING btree ("run_id","path");

-- ---------------------------------------------------------------------------
-- run_permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "run_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "capability" text NOT NULL,
  "scope" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_permissions_run_id_runs_id_fk'
  ) THEN
    ALTER TABLE "run_permissions"
      ADD CONSTRAINT "run_permissions_run_id_runs_id_fk"
      FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "run_permissions__run_idx" ON "run_permissions" USING btree ("run_id");

-- ---------------------------------------------------------------------------
-- run_programs: backfill program_hash, then enforce NOT NULL,
-- then add compiler_version + source_hash with safe backfills
-- ---------------------------------------------------------------------------

-- 1) Ensure program_hash exists + backfill
ALTER TABLE "run_programs" ADD COLUMN IF NOT EXISTS "program_hash" text;

UPDATE "run_programs"
SET "program_hash" = encode(digest(coalesce("program_text", ''), 'sha256'), 'hex')
WHERE "program_hash" IS NULL;

ALTER TABLE "run_programs" ALTER COLUMN "program_hash" SET NOT NULL;

-- 2) compiler_version (nullable -> backfill -> not null)
ALTER TABLE "run_programs" ADD COLUMN IF NOT EXISTS "compiler_version" text;

UPDATE "run_programs"
SET "compiler_version" = 'prose-compiler@0.1.0'
WHERE "compiler_version" IS NULL;

ALTER TABLE "run_programs" ALTER COLUMN "compiler_version" SET NOT NULL;

-- 3) source_hash (nullable -> backfill placeholder -> not null)
ALTER TABLE "run_programs" ADD COLUMN IF NOT EXISTS "source_hash" text;

-- You cannot reconstruct the real source_hash from historical rows,
-- so use deterministic placeholder derived from program_hash.
UPDATE "run_programs"
SET "source_hash" = CONCAT('unknown_source_', "program_hash")
WHERE "source_hash" IS NULL;

ALTER TABLE "run_programs" ALTER COLUMN "source_hash" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- runs: add pinned compiler fields, backfill from run_programs, then index
-- ---------------------------------------------------------------------------

ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "compiler_version" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "program_hash" text;

-- optional backfill from run_programs (safe no-op if table/cols missing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='run_programs' AND column_name='run_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='run_programs' AND column_name='compiler_version'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='run_programs' AND column_name='program_hash'
  ) THEN
    UPDATE "runs" r
    SET
      "compiler_version" = COALESCE(r."compiler_version", rp."compiler_version"),
      "program_hash"     = COALESCE(r."program_hash", rp."program_hash")
    FROM "run_programs" rp
    WHERE rp."run_id" = r."id";
  END IF;
END$$;

-- only create the index if the column exists (it now should)
CREATE INDEX IF NOT EXISTS "runs__program_idx" ON "runs" USING btree ("program_hash");
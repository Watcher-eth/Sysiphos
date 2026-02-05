ALTER TABLE "accounts" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "accounts" ADD COLUMN "expires_at" integer;
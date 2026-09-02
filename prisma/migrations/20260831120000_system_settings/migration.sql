-- Database-held platform configuration.
--
-- AI provider settings (endpoint, model, credentials) previously lived only in
-- environment variables, which meant a redeploy to change them and no record of
-- who changed what. One row per settings group; secrets inside the JSON are
-- encrypted by the service that owns the group, never stored in clear.

-- CreateTable
CREATE TABLE IF NOT EXISTS "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_updated_by_fkey'
  ) THEN
    ALTER TABLE "system_settings"
      ADD CONSTRAINT "system_settings_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

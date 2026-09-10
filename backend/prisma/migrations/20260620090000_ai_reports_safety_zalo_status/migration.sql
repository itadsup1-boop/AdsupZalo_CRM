ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "delivery_status" TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_send_error" TEXT,
  ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "messages_org_id_delivery_status_next_retry_at_idx" ON "messages"("org_id", "delivery_status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "messages_org_id_message_fingerprint_idx" ON "messages"("org_id", "message_fingerprint");

CREATE TABLE IF NOT EXISTS "ai_prompt_versions" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'global',
  "prompt_type" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "reason" TEXT,
  "created_by" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_prompt_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_prompt_versions_org_id_prompt_type_version_key" ON "ai_prompt_versions"("org_id", "prompt_type", "version");
CREATE INDEX IF NOT EXISTS "ai_prompt_versions_org_id_prompt_type_is_active_idx" ON "ai_prompt_versions"("org_id", "prompt_type", "is_active");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_prompt_versions_org_id_fkey') THEN
    ALTER TABLE "ai_prompt_versions"
      ADD CONSTRAINT "ai_prompt_versions_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Expand appointment automation data without dropping existing appointment rows.
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "conversation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_name" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "service_name" TEXT,
  ADD COLUMN IF NOT EXISTS "service_id" TEXT,
  ADD COLUMN IF NOT EXISTS "branch_id" TEXT,
  ADD COLUMN IF NOT EXISTS "note" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "created_by" TEXT NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS "reminder_24h_sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminder_2h_sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "followup_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_followup_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "appointments" a
SET
  "customer_name" = COALESCE(a."customer_name", c."full_name", c."crm_name"),
  "phone" = COALESCE(a."phone", c."phone"),
  "note" = COALESCE(a."note", a."notes"),
  "service_name" = COALESCE(a."service_name", a."type")
FROM "contacts" c
WHERE a."org_id" = c."org_id" AND a."contact_id" = c."id";

UPDATE "appointments"
SET "status" = 'confirmed'
WHERE "status" = 'scheduled';

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "last_customer_message_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_staff_message_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "followup_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_followup_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "user_id" TEXT,
  "team_id" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "entity_type" TEXT,
  "entity_id" TEXT,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_org_id_id_key" ON "notifications"("org_id", "id");
CREATE INDEX IF NOT EXISTS "notifications_org_id_user_id_read_at_idx" ON "notifications"("org_id", "user_id", "read_at");
CREATE INDEX IF NOT EXISTS "notifications_org_id_team_id_read_at_idx" ON "notifications"("org_id", "team_id", "read_at");
CREATE INDEX IF NOT EXISTS "appointments_org_id_phone_idx" ON "appointments"("org_id", "phone");
CREATE INDEX IF NOT EXISTS "appointments_org_id_branch_id_idx" ON "appointments"("org_id", "branch_id");
CREATE INDEX IF NOT EXISTS "appointments_org_id_appointment_date_idx" ON "appointments"("org_id", "appointment_date");
CREATE INDEX IF NOT EXISTS "appointments_org_id_status_idx" ON "appointments"("org_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_org_id_branch_id_fkey'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_org_id_branch_id_fkey"
      FOREIGN KEY ("org_id", "branch_id") REFERENCES "teams"("org_id", "id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_org_id_conversation_id_fkey'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_org_id_conversation_id_fkey"
      FOREIGN KEY ("org_id", "conversation_id") REFERENCES "conversations"("org_id", "id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_org_id_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_org_id_user_id_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_org_id_user_id_fkey"
      FOREIGN KEY ("org_id", "user_id") REFERENCES "users"("org_id", "id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

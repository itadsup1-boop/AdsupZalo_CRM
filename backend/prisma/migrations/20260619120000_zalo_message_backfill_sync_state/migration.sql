-- Zalo connection state and per-conversation message sync checkpoints.
ALTER TABLE "zalo_accounts"
  ADD COLUMN IF NOT EXISTS "disconnected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_reconnect_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "connection_error" TEXT;

CREATE TABLE IF NOT EXISTS "zalo_conversation_sync_states" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "zalo_account_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "last_synced_at" TIMESTAMP(3),
  "last_message_id" TEXT,
  "last_backfill_at" TIMESTAMP(3),
  "sync_status" TEXT NOT NULL DEFAULT 'idle',
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "zalo_conversation_sync_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "zalo_conversation_sync_states_zalo_account_id_conversation_id_key"
  ON "zalo_conversation_sync_states"("zalo_account_id", "conversation_id");

CREATE UNIQUE INDEX IF NOT EXISTS "zalo_conversation_sync_states_org_id_conversation_id_key"
  ON "zalo_conversation_sync_states"("org_id", "conversation_id");

CREATE UNIQUE INDEX IF NOT EXISTS "zalo_conversation_sync_states_org_id_id_key"
  ON "zalo_conversation_sync_states"("org_id", "id");

CREATE INDEX IF NOT EXISTS "zalo_conversation_sync_states_org_id_zalo_account_id_sync_status_idx"
  ON "zalo_conversation_sync_states"("org_id", "zalo_account_id", "sync_status");

CREATE INDEX IF NOT EXISTS "zalo_conversation_sync_states_org_id_last_synced_at_idx"
  ON "zalo_conversation_sync_states"("org_id", "last_synced_at");

ALTER TABLE "zalo_conversation_sync_states"
  ADD CONSTRAINT "zalo_conversation_sync_states_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "zalo_conversation_sync_states"
  ADD CONSTRAINT "zalo_conversation_sync_states_org_id_zalo_account_id_fkey"
  FOREIGN KEY ("org_id", "zalo_account_id") REFERENCES "zalo_accounts"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "zalo_conversation_sync_states"
  ADD CONSTRAINT "zalo_conversation_sync_states_org_id_conversation_id_fkey"
  FOREIGN KEY ("org_id", "conversation_id") REFERENCES "conversations"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

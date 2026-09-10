CREATE TABLE IF NOT EXISTS "assignment_rules" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "team_id" TEXT,
  "service_name" TEXT,
  "source" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "strategy" TEXT NOT NULL DEFAULT 'round_robin',
  "sale_user_ids" TEXT[],
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "assignment_states" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "rule_key" TEXT NOT NULL,
  "cursor" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "contact_assignment_histories" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "from_user_id" TEXT,
  "to_user_id" TEXT,
  "team_id" TEXT,
  "service_name" TEXT,
  "source" TEXT,
  "reason" TEXT NOT NULL,
  "assigned_by_type" TEXT NOT NULL DEFAULT 'system',
  "assigned_by_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_assignment_histories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_activity_logs" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "team_id" TEXT,
  "contact_id" TEXT,
  "conversation_id" TEXT,
  "message_id" TEXT,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "action_type" TEXT NOT NULL,
  "input_message" TEXT,
  "output_message" TEXT,
  "intent" TEXT,
  "confidence" DOUBLE PRECISION,
  "scenario_name" TEXT,
  "knowledge_source" TEXT,
  "tags_added" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "appointment_id" TEXT,
  "assigned_user_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_review_items" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "team_id" TEXT,
  "contact_id" TEXT,
  "conversation_id" TEXT,
  "message_id" TEXT,
  "ai_activity_log_id" TEXT,
  "issue_type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'medium',
  "status" TEXT NOT NULL DEFAULT 'open',
  "customer_message" TEXT,
  "ai_response" TEXT,
  "reason" TEXT,
  "suggested_fix" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_review_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assignment_rules_org_id_id_key" ON "assignment_rules"("org_id", "id");
CREATE INDEX IF NOT EXISTS "assignment_rules_org_id_team_id_idx" ON "assignment_rules"("org_id", "team_id");
CREATE INDEX IF NOT EXISTS "assignment_rules_org_id_is_active_priority_idx" ON "assignment_rules"("org_id", "is_active", "priority");
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_states_org_id_rule_key_key" ON "assignment_states"("org_id", "rule_key");
CREATE INDEX IF NOT EXISTS "contact_assignment_histories_org_id_contact_id_created_at_idx" ON "contact_assignment_histories"("org_id", "contact_id", "created_at");
CREATE INDEX IF NOT EXISTS "contact_assignment_histories_org_id_to_user_id_created_at_idx" ON "contact_assignment_histories"("org_id", "to_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "contact_assignment_histories_org_id_team_id_created_at_idx" ON "contact_assignment_histories"("org_id", "team_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_activity_logs_org_id_id_key" ON "ai_activity_logs"("org_id", "id");
CREATE INDEX IF NOT EXISTS "ai_activity_logs_org_id_team_id_created_at_idx" ON "ai_activity_logs"("org_id", "team_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_activity_logs_org_id_contact_id_created_at_idx" ON "ai_activity_logs"("org_id", "contact_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_activity_logs_org_id_conversation_id_created_at_idx" ON "ai_activity_logs"("org_id", "conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_activity_logs_org_id_action_type_created_at_idx" ON "ai_activity_logs"("org_id", "action_type", "created_at");
CREATE INDEX IF NOT EXISTS "ai_activity_logs_org_id_assigned_user_id_created_at_idx" ON "ai_activity_logs"("org_id", "assigned_user_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_review_items_org_id_id_key" ON "ai_review_items"("org_id", "id");
CREATE INDEX IF NOT EXISTS "ai_review_items_org_id_team_id_created_at_idx" ON "ai_review_items"("org_id", "team_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_review_items_org_id_contact_id_created_at_idx" ON "ai_review_items"("org_id", "contact_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_review_items_org_id_conversation_id_created_at_idx" ON "ai_review_items"("org_id", "conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_review_items_org_id_issue_type_created_at_idx" ON "ai_review_items"("org_id", "issue_type", "created_at");
CREATE INDEX IF NOT EXISTS "ai_review_items_org_id_severity_created_at_idx" ON "ai_review_items"("org_id", "severity", "created_at");
CREATE INDEX IF NOT EXISTS "ai_review_items_org_id_status_created_at_idx" ON "ai_review_items"("org_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "contacts_org_id_team_id_idx" ON "contacts"("org_id", "team_id");
CREATE INDEX IF NOT EXISTS "contacts_org_id_assigned_user_id_idx" ON "contacts"("org_id", "assigned_user_id");
CREATE INDEX IF NOT EXISTS "conversations_org_id_team_id_idx" ON "conversations"("org_id", "team_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_rules_org_id_fkey') THEN
    ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_rules_org_id_team_id_fkey') THEN
    ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_org_id_team_id_fkey" FOREIGN KEY ("org_id", "team_id") REFERENCES "teams"("org_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_states_org_id_fkey') THEN
    ALTER TABLE "assignment_states" ADD CONSTRAINT "assignment_states_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_assignment_histories_org_id_contact_id_fkey') THEN
    ALTER TABLE "contact_assignment_histories" ADD CONSTRAINT "contact_assignment_histories_org_id_contact_id_fkey" FOREIGN KEY ("org_id", "contact_id") REFERENCES "contacts"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_assignment_histories_org_id_to_user_id_fkey') THEN
    ALTER TABLE "contact_assignment_histories" ADD CONSTRAINT "contact_assignment_histories_org_id_to_user_id_fkey" FOREIGN KEY ("org_id", "to_user_id") REFERENCES "users"("org_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_activity_logs_org_id_fkey') THEN
    ALTER TABLE "ai_activity_logs" ADD CONSTRAINT "ai_activity_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_review_items_org_id_fkey') THEN
    ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_activity_logs_org_id_contact_id_fkey') THEN
    ALTER TABLE "ai_activity_logs" ADD CONSTRAINT "ai_activity_logs_org_id_contact_id_fkey" FOREIGN KEY ("org_id", "contact_id") REFERENCES "contacts"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_activity_logs_org_id_conversation_id_fkey') THEN
    ALTER TABLE "ai_activity_logs" ADD CONSTRAINT "ai_activity_logs_org_id_conversation_id_fkey" FOREIGN KEY ("org_id", "conversation_id") REFERENCES "conversations"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_activity_logs_org_id_actor_id_fkey') THEN
    ALTER TABLE "ai_activity_logs" ADD CONSTRAINT "ai_activity_logs_org_id_actor_id_fkey" FOREIGN KEY ("org_id", "actor_id") REFERENCES "users"("org_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_review_items_org_id_contact_id_fkey') THEN
    ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_org_id_contact_id_fkey" FOREIGN KEY ("org_id", "contact_id") REFERENCES "contacts"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_review_items_org_id_conversation_id_fkey') THEN
    ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_org_id_conversation_id_fkey" FOREIGN KEY ("org_id", "conversation_id") REFERENCES "conversations"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_review_items_org_id_ai_activity_log_id_fkey') THEN
    ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_org_id_ai_activity_log_id_fkey" FOREIGN KEY ("org_id", "ai_activity_log_id") REFERENCES "ai_activity_logs"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_review_items_org_id_reviewed_by_fkey') THEN
    ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_org_id_reviewed_by_fkey" FOREIGN KEY ("org_id", "reviewed_by") REFERENCES "users"("org_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "TrainingRequest"
  ADD COLUMN IF NOT EXISTS "jiraIssueKey" TEXT,
  ADD COLUMN IF NOT EXISTS "jiraIssueUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "jiraSyncStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "jiraSyncError" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TrainingRequest_jiraIssueKey_key"
  ON "TrainingRequest"("jiraIssueKey");

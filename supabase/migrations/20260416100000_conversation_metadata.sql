-- Add metadata JSONB column to conversations table
ALTER TABLE conversations ADD COLUMN metadata jsonb DEFAULT NULL;

-- Index for querying by lead_score (supports dashboard sorting)
CREATE INDEX idx_conversations_lead_score
  ON conversations ((metadata->>'lead_score'))
  WHERE metadata IS NOT NULL;

ALTER TABLE control_settings ADD COLUMN approval_policy TEXT NOT NULL DEFAULT 'review_first';
ALTER TABLE control_settings ADD COLUMN notify_by_email INTEGER NOT NULL DEFAULT 1;
ALTER TABLE control_settings ADD COLUMN notification_email TEXT NOT NULL DEFAULT 'sarmad@sarmadirfan.com';

CREATE TABLE IF NOT EXISTS approval_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  related_id TEXT NOT NULL,
  company TEXT NOT NULL,
  contact_name TEXT,
  target TEXT,
  subject TEXT NOT NULL,
  payload_preview TEXT NOT NULL,
  source_url TEXT,
  readiness TEXT NOT NULL DEFAULT 'blocked',
  blocker TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  run_id TEXT,
  FOREIGN KEY (run_id) REFERENCES automation_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_approval_items_queue ON approval_items(status, readiness, created_at);

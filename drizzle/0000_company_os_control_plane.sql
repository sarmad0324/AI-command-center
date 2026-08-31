CREATE TABLE IF NOT EXISTS control_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  automation_mode TEXT NOT NULL DEFAULT 'paused',
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  schedule_hour INTEGER NOT NULL DEFAULT 9,
  lead_target INTEGER NOT NULL DEFAULT 8,
  email_cap INTEGER NOT NULL DEFAULT 5,
  application_cap INTEGER NOT NULL DEFAULT 5,
  followup_days TEXT NOT NULL DEFAULT '4,8,14',
  target_markets TEXT NOT NULL DEFAULT '',
  ideal_customer_profile TEXT NOT NULL DEFAULT '',
  lead_titles TEXT NOT NULL DEFAULT '',
  wellfound_roles TEXT NOT NULL DEFAULT '',
  wellfound_locations TEXT NOT NULL DEFAULT '',
  min_compensation TEXT NOT NULL DEFAULT '',
  application_facts TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS connection_status (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  identity TEXT NOT NULL,
  detail TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  action_url TEXT
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  trigger_source TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  requested_by TEXT,
  lead_target INTEGER NOT NULL DEFAULT 0,
  email_cap INTEGER NOT NULL DEFAULT 0,
  application_cap INTEGER NOT NULL DEFAULT 0,
  leads_found INTEGER NOT NULL DEFAULT 0,
  leads_qualified INTEGER NOT NULL DEFAULT 0,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  followups_sent INTEGER NOT NULL DEFAULT 0,
  applications_submitted INTEGER NOT NULL DEFAULT 0,
  replies_detected INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  blocker TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  title TEXT NOT NULL,
  email TEXT,
  source TEXT NOT NULL,
  qualification_score INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_contact_at TEXT,
  next_followup_at TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  source_url TEXT,
  fit_score INTEGER,
  status TEXT NOT NULL,
  applied_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_address TEXT,
  subject TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES automation_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_requested_at ON automation_runs(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_queue ON automation_runs(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_received_at ON replies(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_occurred_at ON activity_events(occurred_at DESC);

INSERT OR IGNORE INTO control_settings (id) VALUES (1);

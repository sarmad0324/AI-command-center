import { database, ensureDatabase, getSettings, missingActivationRules, mondayStartIso } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureDatabase();
  const db = database();
  const weekStart = mondayStartIso();
  const settings = await getSettings();

  const [connections, runs, leads, applications, replies, activity, approvals, approvalMetrics, totals, week, queue] = await Promise.all([
    db.prepare('SELECT * FROM connection_status ORDER BY name').all(),
    db.prepare('SELECT * FROM automation_runs ORDER BY requested_at DESC LIMIT 12').all(),
    db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 50').all(),
    db.prepare('SELECT * FROM applications ORDER BY created_at DESC LIMIT 50').all(),
    db.prepare('SELECT * FROM replies ORDER BY received_at DESC LIMIT 50').all(),
    db.prepare('SELECT * FROM activity_events ORDER BY occurred_at DESC LIMIT 16').all(),
    db.prepare(`SELECT * FROM approval_items
      WHERE status IN ('pending', 'approved', 'queued', 'blocked')
      ORDER BY CASE item_type WHEN 'email' THEN 0 ELSE 1 END, created_at, company`).all(),
    db.prepare(`SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'pending' AND readiness = 'ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status = 'pending' AND readiness != 'ready' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN status IN ('approved', 'queued') THEN 1 ELSE 0 END) AS authorized
      FROM approval_items`).first(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM leads) AS leads,
      (SELECT COALESCE(SUM(emails_sent + followups_sent), 0) FROM automation_runs) AS emails,
      (SELECT COUNT(*) FROM applications WHERE applied_at IS NOT NULL) AS applications,
      (SELECT COUNT(*) FROM replies WHERE status = 'needs_handoff') AS replies
    `).first(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM leads WHERE created_at >= ?) AS leads,
      (SELECT COALESCE(SUM(emails_sent + followups_sent), 0) FROM automation_runs WHERE requested_at >= ?) AS emails,
      (SELECT COUNT(*) FROM applications WHERE applied_at >= ?) AS applications,
      (SELECT COUNT(*) FROM replies WHERE received_at >= ?) AS replies
    `).bind(weekStart, weekStart, weekStart, weekStart).first(),
    db.prepare(`SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status = 'needs_setup' THEN 1 ELSE 0 END) AS needs_setup
      FROM automation_runs
    `).first(),
  ]);

  const now = Date.now();
  const liveConnections = connections.results.map((row) => {
    const connection = row as Record<string, unknown>;
    if (connection.id !== 'ai-executor') return connection;
    const checkedAt = Date.parse(String(connection.checked_at ?? ''));
    if (Number.isFinite(checkedAt) && now - checkedAt <= 180_000) return connection;
    return {
      ...connection,
      status: 'offline',
      detail: 'The AI execution heartbeat has not checked in during the last three minutes. Approved work will remain safely queued until it reconnects.',
    };
  });

  return Response.json({
    generatedAt: new Date().toISOString(),
    metrics: totals,
    week,
    queue,
    settings,
    setupMissing: settings ? missingActivationRules(settings) : [],
    connections: liveConnections,
    runs: runs.results,
    leads: leads.results,
    applications: applications.results,
    replies: replies.results,
    activity: activity.results,
    approvals: approvals.results,
    approvalMetrics,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1k5jx9vr5rTk0c1Ly0K-bB40zmV9dH3pPKnAoqr-KA7M/edit',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

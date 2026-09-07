import { database, ensureDatabase } from '@/db';

export const dynamic = 'force-dynamic';

type RecordInput = Record<string, unknown>;

function count(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(0, Math.min(1000, number)) : 0;
}

function text(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json().catch(() => ({})) as RecordInput;
  const runId = text(body.runId, 80);
  if (!runId) return Response.json({ error: 'runId is required.' }, { status: 400 });

  const db = database();
  const existing = await db.prepare('SELECT id FROM automation_runs WHERE id = ?').bind(runId).first();
  if (!existing) return Response.json({ error: 'Run not found.' }, { status: 404 });

  const status = ['completed', 'failed', 'blocked'].includes(text(body.status, 20)) ? text(body.status, 20) : 'completed';
  const completedAt = new Date().toISOString();
  const metrics = (body.metrics ?? {}) as RecordInput;
  const statements = [
    db.prepare(`UPDATE automation_runs SET
      status = ?, completed_at = ?, leads_found = ?, leads_qualified = ?, emails_sent = ?, followups_sent = ?,
      applications_submitted = ?, replies_detected = ?, summary = ?, blocker = ? WHERE id = ?
    `).bind(
      status,
      completedAt,
      count(metrics.leadsFound),
      count(metrics.leadsQualified),
      count(metrics.emailsSent),
      count(metrics.followupsSent),
      count(metrics.applicationsSubmitted),
      count(metrics.repliesDetected),
      text(body.summary, 2000) || null,
      text(body.blocker, 2000) || null,
      runId,
    ),
  ];

  statements.push(db.prepare(`UPDATE approval_items SET status = ?
    WHERE run_id = ? AND status = 'approved'`).bind(status === 'completed' ? 'completed' : 'blocked', runId));

  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 100) as RecordInput[] : [];
  for (const lead of leads) {
    statements.push(db.prepare(`INSERT OR REPLACE INTO leads
      (id, company, contact_name, title, email, source, qualification_score, status, created_at, last_contact_at, next_followup_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      text(lead.id, 80) || crypto.randomUUID(),
      text(lead.company, 240),
      text(lead.contactName, 240),
      text(lead.title, 240),
      text(lead.email, 320) || null,
      text(lead.source, 80) || 'Apollo',
      count(lead.qualificationScore) || null,
      text(lead.status, 60) || 'qualified',
      text(lead.createdAt, 80) || completedAt,
      text(lead.lastContactAt, 80) || null,
      text(lead.nextFollowupAt, 80) || null,
    ));
  }

  const applications = Array.isArray(body.applications) ? body.applications.slice(0, 50) as RecordInput[] : [];
  for (const application of applications) {
    statements.push(db.prepare(`INSERT OR REPLACE INTO applications
      (id, company, role, source_url, fit_score, status, applied_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      text(application.id, 80) || crypto.randomUUID(),
      text(application.company, 240),
      text(application.role, 240),
      text(application.sourceUrl, 1200) || null,
      count(application.fitScore) || null,
      text(application.status, 60) || 'tracked',
      text(application.appliedAt, 80) || null,
      text(application.createdAt, 80) || completedAt,
    ));
  }

  const replies = Array.isArray(body.replies) ? body.replies.slice(0, 100) as RecordInput[] : [];
  for (const reply of replies) {
    statements.push(db.prepare(`INSERT OR REPLACE INTO replies
      (id, channel, sender_name, sender_address, subject, sentiment, received_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      text(reply.id, 80) || crypto.randomUUID(),
      text(reply.channel, 80) || 'Gmail',
      text(reply.senderName, 240),
      text(reply.senderAddress, 320) || null,
      text(reply.subject, 500),
      text(reply.sentiment, 60) || 'unknown',
      text(reply.receivedAt, 80) || completedAt,
      text(reply.status, 60) || 'needs_handoff',
    ));
  }

  statements.push(db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    runId,
    status,
    status === 'completed' ? 'Sales run completed' : `Sales run ${status}`,
    text(body.summary, 1000) || text(body.blocker, 1000) || 'The execution worker reported a final state.',
    completedAt,
  ));

  await db.batch(statements);
  return Response.json({ ok: true, runId, status });
}

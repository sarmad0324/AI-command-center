import { database, ensureDatabase, getSettings, missingActivationRules } from '@/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  await ensureDatabase();
  const db = database();
  const body = await request.json().catch(() => ({})) as { runType?: string; triggerSource?: string; idempotencyKey?: string };
  const runType = body.runType === 'connection_check' ? 'connection_check' : 'full_sales_cycle';
  const triggerSource = body.triggerSource === 'schedule' ? 'schedule' : 'dashboard';
  const idempotencyKey = String(body.idempotencyKey ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  const settings = await getSettings();

  if (!settings) {
    return Response.json({ error: 'Settings are unavailable.' }, { status: 500 });
  }

  const active = await db.prepare(`
    SELECT * FROM automation_runs
    WHERE run_type = ? AND status IN ('queued', 'running')
    ORDER BY requested_at DESC LIMIT 1
  `).bind(runType).first();
  if (active) {
    return Response.json({ error: 'A run is already queued or running.', run: active }, { status: 409 });
  }

  const missing = runType === 'connection_check' ? [] : missingActivationRules(settings);
  const id = triggerSource === 'schedule' && idempotencyKey ? `scheduled-${idempotencyKey}` : crypto.randomUUID();
  const duplicate = await db.prepare('SELECT * FROM automation_runs WHERE id = ?').bind(id).first();
  if (duplicate) return Response.json({ run: duplicate, duplicate: true }, { status: 200 });
  const requestedAt = new Date().toISOString();
  const status = missing.length ? 'needs_setup' : 'queued';
  const blocker = missing.length ? `Complete: ${missing.join(', ')}.` : null;
  const requestedBy = request.headers.get('oai-authenticated-user-email')
    ?? request.headers.get('oai-authenticated-user-id')
    ?? 'dashboard-user';

  await db.batch([
    db.prepare(`INSERT INTO automation_runs (
      id, run_type, trigger_source, status, requested_at, requested_by,
      lead_target, email_cap, application_cap, blocker
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, runType, triggerSource, status, requestedAt, requestedBy, settings.lead_target, settings.email_cap, settings.application_cap, blocker),
    db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        id,
        status,
        status === 'queued' ? 'Sales run queued' : 'Sales run needs setup',
        blocker ?? 'The request is ready for the connected AI execution worker.',
        requestedAt,
      ),
  ]);

  const run = await db.prepare('SELECT * FROM automation_runs WHERE id = ?').bind(id).first();
  return Response.json({ run, missing }, { status: missing.length ? 409 : 201 });
}

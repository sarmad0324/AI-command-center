import { database, ensureDatabase, getSettings } from '@/db';

export const dynamic = 'force-dynamic';

type DecisionBody = {
  action?: 'approve_ready_and_run' | 'reject';
  itemType?: 'email' | 'application' | 'all';
  itemIds?: string[];
  enableAutomatic?: boolean;
};

function requestedBy(request: Request) {
  return request.headers.get('oai-authenticated-user-email')
    ?? request.headers.get('oai-authenticated-user-id')
    ?? 'dashboard-owner';
}

export async function POST(request: Request) {
  await ensureDatabase();
  const db = database();
  const body = await request.json().catch(() => ({})) as DecisionBody;
  const action = body.action;
  const itemType = ['email', 'application', 'all'].includes(String(body.itemType)) ? body.itemType ?? 'all' : 'all';
  const ids = Array.isArray(body.itemIds)
    ? [...new Set(body.itemIds.map((value) => String(value).slice(0, 100)))].slice(0, 30)
    : [];

  if (!['approve_ready_and_run', 'reject'].includes(String(action))) {
    return Response.json({ error: 'Choose an approval action.' }, { status: 400 });
  }

  const clauses = [`status = 'pending'`];
  const bindings: string[] = [];
  if (itemType !== 'all') { clauses.push('item_type = ?'); bindings.push(itemType); }
  if (ids.length) { clauses.push(`id IN (${ids.map(() => '?').join(',')})`); bindings.push(...ids); }
  if (action === 'approve_ready_and_run') clauses.push(`readiness = 'ready'`);

  const selected = await db.prepare(`SELECT * FROM approval_items WHERE ${clauses.join(' AND ')} ORDER BY item_type, created_at`)
    .bind(...bindings).all<Record<string, unknown>>();
  if (!selected.results.length) {
    const message = action === 'approve_ready_and_run'
      ? 'No selected items are executable yet. Resolve the readiness blockers first.'
      : 'No pending items matched this request.';
    return Response.json({ error: message }, { status: 409 });
  }

  const now = new Date().toISOString();
  const actor = requestedBy(request);
  if (action === 'reject') {
    const updates = selected.results.map((item) => db.prepare(`UPDATE approval_items
      SET status = 'rejected', decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'`)
      .bind(now, actor, item.id));
    updates.push(db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
      VALUES (?, NULL, 'approval_rejected', 'Approval items rejected', ?, ?)`)
      .bind(crypto.randomUUID(), `${selected.results.length} item(s) were rejected by the dashboard owner.`, now));
    await db.batch(updates);
    return Response.json({ ok: true, rejected: selected.results.length });
  }

  const settings = await getSettings();
  if (!settings) return Response.json({ error: 'Automation settings are unavailable.' }, { status: 500 });
  const runId = crypto.randomUUID();
  const emailCount = selected.results.filter((item) => item.item_type === 'email').length;
  const applicationCount = selected.results.filter((item) => item.item_type === 'application').length;
  const statements = selected.results.map((item) => db.prepare(`UPDATE approval_items
    SET status = 'approved', decided_at = ?, decided_by = ?, run_id = ?
    WHERE id = ? AND status = 'pending' AND readiness = 'ready'`)
    .bind(now, actor, runId, item.id));

  statements.push(db.prepare(`INSERT INTO automation_runs (
    id, run_type, trigger_source, status, requested_at, requested_by,
    lead_target, email_cap, application_cap, summary
  ) VALUES (?, 'approved_sales_cycle', 'dashboard_approval', 'queued', ?, ?, 0, ?, ?, ?)`)
    .bind(runId, now, actor, emailCount, applicationCount, `Owner approved ${emailCount} email(s) and ${applicationCount} application(s) for execution.`));
  statements.push(db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
    VALUES (?, ?, 'approved', 'Owner approved an execution batch', ?, ?)`)
    .bind(crypto.randomUUID(), runId, `${emailCount} email(s) and ${applicationCount} application(s) are authorized and queued.`, now));
  if (body.enableAutomatic) {
    statements.push(db.prepare(`UPDATE control_settings
      SET approval_policy = 'automatic', automation_mode = 'scheduled', updated_at = ? WHERE id = 1`).bind(now));
    statements.push(db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
      VALUES (?, ?, 'policy_updated', 'Automatic daily execution enabled', ?, ?)`)
      .bind(crypto.randomUUID(), runId, `Future truth-checked items may execute automatically within the saved daily caps.`, now));
  }
  await db.batch(statements);
  return Response.json({ ok: true, runId, emailCount, applicationCount, automaticEnabled: Boolean(body.enableAutomatic) }, { status: 201 });
}

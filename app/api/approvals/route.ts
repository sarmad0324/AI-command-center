import { database, ensureDatabase, getSettings } from '@/db';
import { karachiDayStartIso, SALES_POLICY, validateFounderEmail } from '@/lib/sales-policy';

export const dynamic = 'force-dynamic';

type DecisionBody = {
  action?: 'approve_ready_and_run' | 'reject';
  itemType?: 'email' | 'application' | 'all';
  itemIds?: string[];
};

function requestedBy(request: Request) {
  return request.headers.get('oai-authenticated-user-email')
    ?? request.headers.get('oai-authenticated-user-id')
    ?? 'dashboard-owner';
}

export async function POST(request: Request) {
  try {
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

    const selected = await db.prepare(`SELECT approval_items.*,
        leads.qualification_score AS lead_qualification_score,
        leads.last_contact_at AS lead_last_contact_at,
        leads.status AS lead_status,
        leads.source AS lead_source
      FROM approval_items LEFT JOIN leads
        ON approval_items.item_type = 'email' AND approval_items.related_id = leads.id
      WHERE ${clauses.map((clause) => `approval_items.${clause}`).join(' AND ')}
      ORDER BY approval_items.item_type, approval_items.created_at`)
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
    const invalidEmails = selected.results
      .filter((item) => item.item_type === 'email')
      .map((item) => ({ item, problems: validateFounderEmail({
        target: item.target,
        contactName: item.contact_name,
        subject: item.subject,
        body: item.payload_preview,
        sourceUrl: item.source_url || item.lead_source,
        qualificationScore: item.lead_qualification_score,
        createdAt: item.created_at,
        lastContactAt: item.lead_last_contact_at,
        leadStatus: item.lead_status,
      }) }))
      .filter(({ problems }) => problems.length);
    if (invalidEmails.length) {
      const first = invalidEmails[0];
      return Response.json({ error: `${String(first.item.company)} is not execution-ready: ${first.problems.join(' ')}` }, { status: 409 });
    }

    const dayStart = karachiDayStartIso();
    const usedToday = await db.prepare(`SELECT
      (SELECT COALESCE(SUM(emails_sent + followups_sent), 0) FROM automation_runs WHERE requested_at >= ?) +
        (SELECT COUNT(*) FROM approval_items WHERE item_type = 'email' AND status IN ('approved', 'queued') AND decided_at >= ?) AS emails,
      (SELECT COALESCE(SUM(applications_submitted), 0) FROM automation_runs WHERE requested_at >= ?) +
        (SELECT COUNT(*) FROM approval_items WHERE item_type = 'application' AND status IN ('approved', 'queued') AND decided_at >= ?) AS applications
    `).bind(dayStart, dayStart, dayStart, dayStart).first<Record<string, number>>();
    const runId = crypto.randomUUID();
    const emailCount = selected.results.filter((item) => item.item_type === 'email').length;
    const applicationCount = selected.results.filter((item) => item.item_type === 'application').length;
    if (Number(usedToday?.emails ?? 0) + emailCount > SALES_POLICY.dailyEmailCap) {
      return Response.json({ error: `This approval would exceed the ${SALES_POLICY.dailyEmailCap}-email daily cap.` }, { status: 409 });
    }
    if (Number(usedToday?.applications ?? 0) + applicationCount > SALES_POLICY.dailyApplicationCap) {
      return Response.json({ error: `This approval would exceed the ${SALES_POLICY.dailyApplicationCap}-application daily cap.` }, { status: 409 });
    }

    // The run must exist before approval_items can reference it through their foreign key.
    const statements = [db.prepare(`INSERT INTO automation_runs (
      id, run_type, trigger_source, status, requested_at, requested_by,
      lead_target, email_cap, application_cap, summary
    ) VALUES (?, 'approved_sales_cycle', 'dashboard_approval', 'queued', ?, ?, 0, ?, ?, ?)`)
      .bind(runId, now, actor, emailCount, applicationCount, `Owner approved ${emailCount} email(s) and ${applicationCount} application(s) for execution.`)];

    statements.push(...selected.results.map((item) => db.prepare(`UPDATE approval_items
      SET status = 'approved', decided_at = ?, decided_by = ?, run_id = ?
      WHERE id = ? AND status = 'pending' AND readiness = 'ready'`)
      .bind(now, actor, runId, item.id)));

    statements.push(db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
      VALUES (?, ?, 'approved', 'Owner approved an execution batch', ?, ?)`)
      .bind(crypto.randomUUID(), runId, `${emailCount} email(s) and ${applicationCount} application(s) are authorized and queued.`, now));
    await db.batch(statements);
    return Response.json({ ok: true, runId, emailCount, applicationCount, automaticEnabled: false }, { status: 201 });
  } catch (error) {
    console.error('Approval request failed', error);
    return Response.json({ error: 'The approval could not be recorded. Please retry after refreshing the queue.' }, { status: 500 });
  }
}

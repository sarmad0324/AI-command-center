import { database, ensureDatabase } from '@/db';
import { validateFounderEmail } from '@/lib/sales-policy';

export const dynamic = 'force-dynamic';

type Input = Record<string, unknown>;

function text(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function score(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json().catch(() => ({})) as Input;
  const runId = text(body.runId, 100);
  if (!runId) return Response.json({ error: 'runId is required.' }, { status: 400 });

  const db = database();
  const run = await db.prepare('SELECT id FROM automation_runs WHERE id = ?').bind(runId).first();
  if (!run) return Response.json({ error: 'Run not found.' }, { status: 404 });

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let leadsAdded = 0;
  let applicationsAdded = 0;
  let approvalsAdded = 0;

  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 100) as Input[] : [];
  const incomingLeads = new Map(leads.map((lead) => [text(lead.id, 100), lead]));
  for (const lead of leads) {
    const id = text(lead.id, 100) || crypto.randomUUID();
    const email = text(lead.email, 320).toLowerCase();
    const existing = email
      ? await db.prepare('SELECT id FROM leads WHERE LOWER(email) = ?').bind(email).first()
      : await db.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first();
    if (existing) continue;
    statements.push(db.prepare(`INSERT INTO leads
      (id, company, contact_name, title, email, source, qualification_score, status, created_at, last_contact_at, next_followup_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`).bind(
        id, text(lead.company, 240), text(lead.contactName, 240), text(lead.title, 240), email || null,
        text(lead.source, 80) || 'Research', score(lead.qualificationScore), text(lead.status, 60) || 'qualified',
        text(lead.createdAt, 80) || now,
      ));
    leadsAdded += 1;
  }

  const applications = Array.isArray(body.applications) ? body.applications.slice(0, 50) as Input[] : [];
  for (const application of applications) {
    const id = text(application.id, 100) || crypto.randomUUID();
    const sourceUrl = text(application.sourceUrl, 1200);
    const existing = sourceUrl
      ? await db.prepare('SELECT id FROM applications WHERE source_url = ?').bind(sourceUrl).first()
      : await db.prepare('SELECT id FROM applications WHERE id = ?').bind(id).first();
    if (existing) continue;
    statements.push(db.prepare(`INSERT INTO applications
      (id, company, role, source_url, fit_score, status, applied_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'qualified', NULL, ?)`).bind(
        id, text(application.company, 240), text(application.role, 240), sourceUrl || null,
        score(application.fitScore), text(application.createdAt, 80) || now,
      ));
    applicationsAdded += 1;
  }

  const approvals = Array.isArray(body.approvals) ? body.approvals.slice(0, 100) as Input[] : [];
  for (const approval of approvals) {
    const id = text(approval.id, 100) || crypto.randomUUID();
    const itemType = approval.itemType === 'application' ? 'application' : 'email';
    const relatedId = text(approval.relatedId, 100);
    if (!relatedId) continue;
    const duplicate = await db.prepare(`SELECT id FROM approval_items
      WHERE id = ? OR (item_type = ? AND related_id = ? AND status IN ('pending', 'approved', 'queued'))`)
      .bind(id, itemType, relatedId).first();
    if (duplicate) continue;
    const target = text(approval.target, 500);
    const sourceUrl = text(approval.sourceUrl, 1200);
    const explicitlyReady = approval.readiness === 'ready';
    let policyProblems: string[] = [];
    if (itemType === 'email') {
      const incomingLead = incomingLeads.get(relatedId);
      const storedLead = incomingLead ? null : await db.prepare('SELECT * FROM leads WHERE id = ?').bind(relatedId).first<Record<string, unknown>>();
      policyProblems = validateFounderEmail({
        target,
        contactName: approval.contactName ?? incomingLead?.contactName ?? storedLead?.contact_name,
        subject: approval.subject,
        body: approval.payloadPreview,
        sourceUrl: sourceUrl || incomingLead?.sourceUrl || incomingLead?.triggerUrl || storedLead?.source,
        qualificationScore: incomingLead?.qualificationScore ?? storedLead?.qualification_score,
        createdAt: approval.createdAt ?? incomingLead?.createdAt ?? storedLead?.created_at ?? now,
        lastContactAt: storedLead?.last_contact_at,
        leadStatus: incomingLead?.status ?? storedLead?.status,
      });
      if (approval.verifiedEmail !== true || !validEmail(target)) policyProblems.unshift('The personal email address must be verified by the research worker.');
    }
    const ready = itemType === 'email'
      ? explicitlyReady && policyProblems.length === 0
      : explicitlyReady && Boolean(sourceUrl);
    const blocker = ready ? '' : policyProblems.join(' ') || text(approval.blocker, 1000) || (itemType === 'email'
      ? 'A verified personal decision-maker email and complete service-outreach draft are required.'
      : 'The application is missing a live role URL or a verified applicant fact.');
    statements.push(db.prepare(`INSERT INTO approval_items
      (id, item_type, related_id, company, contact_name, target, subject, payload_preview, source_url, readiness, blocker, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).bind(
        id, itemType, relatedId, text(approval.company, 240), text(approval.contactName, 240) || null,
        target || null, text(approval.subject, 500), text(approval.payloadPreview, 4000), sourceUrl || null,
        ready ? 'ready' : 'blocked', blocker || null, text(approval.createdAt, 80) || now,
      ));
    approvalsAdded += 1;
  }

  statements.push(db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
    VALUES (?, ?, 'prepared', 'Approval batch prepared', ?, ?)`).bind(
      crypto.randomUUID(), runId,
      `${leadsAdded} new lead(s), ${applicationsAdded} application(s), and ${approvalsAdded} approval item(s) were added.`, now,
    ));

  await db.batch(statements);
  return Response.json({ ok: true, leadsAdded, applicationsAdded, approvalsAdded });
}

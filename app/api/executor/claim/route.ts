import { database, ensureDatabase } from '@/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  await ensureDatabase();
  const db = database();
  const candidate = await db.prepare(`
    SELECT * FROM automation_runs WHERE status = 'queued' ORDER BY requested_at LIMIT 1
  `).first<{ id: string }>();
  if (!candidate) return Response.json({ run: null }, { status: 204 });

  const startedAt = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE automation_runs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'
  `).bind(startedAt, candidate.id).run();
  if (!result.meta.changes) return Response.json({ error: 'The run was claimed by another worker.' }, { status: 409 });

  await db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
    VALUES (?, ?, 'running', 'AI worker started', 'The queued request was claimed for execution.', ?)
  `).bind(crypto.randomUUID(), candidate.id, startedAt).run();

  const run = await db.prepare('SELECT * FROM automation_runs WHERE id = ?').bind(candidate.id).first();
  const approvals = await db.prepare(`SELECT * FROM approval_items
    WHERE run_id = ? AND status = 'approved' ORDER BY item_type, created_at`).bind(candidate.id).all();
  return Response.json({ run, approvals: approvals.results });
}

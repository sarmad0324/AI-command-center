import { database, ensureDatabase } from '@/db';

export const dynamic = 'force-dynamic';

type Input = Record<string, unknown>;

function text(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json().catch(() => ({})) as Input;
  const db = database();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let repliesAdded = 0;
  let bouncesAdded = 0;

  const connections = Array.isArray(body.connections) ? body.connections.slice(0, 20) as Input[] : [];
  const reportedConnections: Input[] = [
    {
      id: 'ai-executor',
      name: 'AI Executor',
      channel: 'Queue processing and reply monitoring',
      status: 'connected',
      identity: 'Sarmad Company OS · scheduled worker',
      detail: 'The execution worker checked in successfully.',
      actionUrl: 'https://sarmad-company-os.sarmadirfan78.chatgpt.site/',
    },
    ...connections,
  ];
  for (const connection of reportedConnections) {
    const id = text(connection.id, 100);
    if (!id) continue;
    const rawStatus = text(connection.status, 40);
    const status = ['connected', 'degraded', 'disconnected', 'error', 'expired', 'offline'].includes(rawStatus)
      ? rawStatus
      : 'error';
    statements.push(db.prepare(`INSERT INTO connection_status
      (id, name, channel, status, identity, detail, checked_at, action_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, channel = excluded.channel, status = excluded.status,
        identity = excluded.identity, detail = excluded.detail, checked_at = excluded.checked_at,
        action_url = excluded.action_url`).bind(
          id,
          text(connection.name, 200) || id,
          text(connection.channel, 240) || 'Integration',
          status,
          text(connection.identity, 320) || 'Not available',
          text(connection.detail, 1000) || 'No connector detail was reported.',
          now,
          text(connection.actionUrl, 1200) || null,
        ));
  }

  const replies = Array.isArray(body.replies) ? body.replies.slice(0, 100) as Input[] : [];
  for (const reply of replies) {
    const id = text(reply.id, 100) || crypto.randomUUID();
    const existing = await db.prepare('SELECT id FROM replies WHERE id = ?').bind(id).first();
    if (existing) continue;
    const senderAddress = text(reply.senderAddress, 320).toLowerCase();
    const senderName = text(reply.senderName, 240) || senderAddress || 'Unknown sender';
    const subject = text(reply.subject, 500) || '(No subject)';
    statements.push(db.prepare(`INSERT INTO replies
      (id, channel, sender_name, sender_address, subject, sentiment, received_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'needs_handoff')`).bind(
        id,
        text(reply.channel, 80) || 'Gmail',
        senderName,
        senderAddress || null,
        subject,
        text(reply.sentiment, 60) || 'unknown',
        text(reply.receivedAt, 80) || now,
      ));
    if (senderAddress) {
      statements.push(db.prepare(`UPDATE leads SET status = 'replied', next_followup_at = NULL
        WHERE LOWER(email) = ?`).bind(senderAddress));
    }
    statements.push(db.prepare(`INSERT INTO activity_events
      (id, run_id, event_type, label, detail, occurred_at)
      VALUES (?, NULL, 'reply', 'Reply needs Sarmad', ?, ?)`).bind(
        crypto.randomUUID(), `${senderName} replied: ${subject}`, text(reply.receivedAt, 80) || now,
      ));
    repliesAdded += 1;
  }

  const bounces = Array.isArray(body.bounces) ? body.bounces.slice(0, 100) as Input[] : [];
  for (const bounce of bounces) {
    const leadId = text(bounce.leadId, 100);
    const email = text(bounce.email, 320).toLowerCase();
    if (!leadId && !email) continue;
    const reason = text(bounce.reason, 1000) || 'The recipient address rejected delivery.';
    if (leadId) {
      statements.push(db.prepare(`UPDATE leads SET status = 'bounced', next_followup_at = NULL WHERE id = ?`).bind(leadId));
      statements.push(db.prepare(`UPDATE approval_items SET status = 'blocked', readiness = 'blocked', blocker = ?
        WHERE related_id = ? AND status = 'pending'`).bind(reason, leadId));
    } else {
      statements.push(db.prepare(`UPDATE leads SET status = 'bounced', next_followup_at = NULL WHERE LOWER(email) = ?`).bind(email));
      statements.push(db.prepare(`UPDATE approval_items SET status = 'blocked', readiness = 'blocked', blocker = ?
        WHERE LOWER(target) = ? AND status = 'pending'`).bind(reason, email));
    }
    statements.push(db.prepare(`INSERT OR IGNORE INTO activity_events
      (id, run_id, event_type, label, detail, occurred_at)
      VALUES (?, NULL, 'bounce', 'Email delivery failed', ?, ?)`).bind(
        text(bounce.id, 100) || crypto.randomUUID(),
        `${email || leadId}: ${reason}`,
        text(bounce.receivedAt, 80) || now,
      ));
    bouncesAdded += 1;
  }

  await db.batch(statements);
  return Response.json({ ok: true, connectionsChecked: reportedConnections.length, repliesAdded, bouncesAdded });
}

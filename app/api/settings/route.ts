import { database, ensureDatabase, getSettings, missingActivationRules } from '@/db';

export const dynamic = 'force-dynamic';

const textFields = [
  'target_markets',
  'ideal_customer_profile',
  'lead_titles',
  'wellfound_roles',
  'wellfound_locations',
  'min_compensation',
  'application_facts',
  'notification_email',
] as const;

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function PUT(request: Request) {
  await ensureDatabase();
  const current = await getSettings();
  if (!current) return Response.json({ error: 'Settings are unavailable.' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const mode = ['paused', 'manual', 'scheduled'].includes(String(body.automation_mode))
    ? String(body.automation_mode)
    : current.automation_mode;
  const approvalPolicy = 'review_first';
  const values: Record<string, string> = {};
  for (const field of textFields) {
    values[field] = String(body[field] ?? current[field]).trim().slice(0, 4000);
  }
  const followupDays = String(body.followup_days ?? current.followup_days)
    .split(',')
    .map((part) => boundedInteger(part.trim(), 0, 1, 60))
    .filter(Boolean)
    .slice(0, 7)
    .join(',') || current.followup_days;
  const updatedAt = new Date().toISOString();

  await database().prepare(`UPDATE control_settings SET
    automation_mode = ?, timezone = ?, schedule_hour = ?, lead_target = ?, email_cap = ?, application_cap = ?,
    followup_days = ?, target_markets = ?, ideal_customer_profile = ?, lead_titles = ?, wellfound_roles = ?,
    wellfound_locations = ?, min_compensation = ?, application_facts = ?, updated_at = ?
    , approval_policy = ?, notify_by_email = ?, notification_email = ?
    WHERE id = 1
  `).bind(
    mode,
    String(body.timezone ?? current.timezone).trim().slice(0, 80) || 'Asia/Karachi',
    boundedInteger(body.schedule_hour, current.schedule_hour, 0, 23),
    boundedInteger(body.lead_target, current.lead_target, 1, 25),
    boundedInteger(body.email_cap, current.email_cap, 0, 25),
    boundedInteger(body.application_cap, current.application_cap, 0, 10),
    followupDays,
    values.target_markets,
    values.ideal_customer_profile,
    values.lead_titles,
    values.wellfound_roles,
    values.wellfound_locations,
    values.min_compensation,
    values.application_facts,
    updatedAt,
    approvalPolicy,
    body.notify_by_email === false || body.notify_by_email === 0 ? 0 : 1,
    values.notification_email || 'sarmad@sarmadirfan.com',
  ).run();

  const settings = await getSettings();
  return Response.json({ settings, setupMissing: settings ? missingActivationRules(settings) : [] });
}

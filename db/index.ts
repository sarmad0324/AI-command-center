import { env } from 'cloudflare:workers';
import { defaultApprovalItems, defaultConnections, schemaStatements } from './schema';

export type ControlSettings = {
  automation_mode: 'paused' | 'manual' | 'scheduled';
  timezone: string;
  schedule_hour: number;
  lead_target: number;
  email_cap: number;
  application_cap: number;
  followup_days: string;
  target_markets: string;
  ideal_customer_profile: string;
  lead_titles: string;
  wellfound_roles: string;
  wellfound_locations: string;
  min_compensation: string;
  application_facts: string;
  approval_policy: 'review_first' | 'automatic';
  notify_by_email: number;
  notification_email: string;
  updated_at: string;
};

let initialization: Promise<void> | null = null;

export function database(): D1Database {
  return env.DB as D1Database;
}

export async function ensureDatabase() {
  if (!initialization) {
    initialization = (async () => {
      const db = database();
      for (const statement of schemaStatements) {
        await db.prepare(statement).run();
      }
      await db.prepare(`INSERT OR IGNORE INTO control_settings (id) VALUES (1)`).run();
      const checkedAt = new Date().toISOString();
      for (const connection of defaultConnections) {
        await db.prepare(`
          INSERT OR IGNORE INTO connection_status
            (id, name, channel, status, identity, detail, checked_at, action_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          connection.id,
          connection.name,
          connection.channel,
          connection.status,
          connection.identity,
          connection.detail,
          checkedAt,
          connection.actionUrl,
        ).run();
      }
      for (const item of defaultApprovalItems) {
        await db.prepare(`
          INSERT OR IGNORE INTO approval_items
            (id, item_type, related_id, company, contact_name, target, subject, payload_preview, source_url, readiness, blocker, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
          item.id,
          item.itemType,
          item.relatedId,
          item.company,
          item.contactName || null,
          item.target || null,
          item.subject,
          item.preview,
          'sourceUrl' in item ? item.sourceUrl : null,
          item.readiness,
          item.blocker || null,
          '2026-09-01T09:15:00.000Z',
        ).run();
      }

      const verifiedProfileUpdateId = 'policy-update-20260907-review-first';
      const verifiedProfileUpdate = await db.prepare('SELECT id FROM activity_events WHERE id = ?')
        .bind(verifiedProfileUpdateId).first();
      if (!verifiedProfileUpdate) {
        const updatedAt = new Date().toISOString();
        const applicationFacts = 'Sarmad Irfan; Lahore, Pakistan; remote and international; Technical Partner / Product Engineer; 5+ years of software engineering experience, work authorization, Node.js experience, and WebGL experience confirmed directly by Sarmad on 2026-09-07; React, Next.js, TypeScript, React Native, Expo, Express, PostgreSQL, Supabase, Firebase, Docker, GitHub, CI/CD, cloud deployment, APIs, authentication, RBAC, and system architecture; GitHub https://github.com/sarmad0324; website https://www.sarmadirfan.com/; more than two years of end-to-end technical ownership on TruckWise. Work-authorization country/region, compensation expectations, exact availability, degree completion, and any other unverified answer must not be invented.';
        const policyUpdates = [
          db.prepare(`UPDATE control_settings SET
            automation_mode = 'scheduled', approval_policy = 'review_first', timezone = 'Asia/Karachi',
            schedule_hour = 9, lead_target = 10, email_cap = 10, application_cap = 5,
            application_facts = ?, updated_at = ? WHERE id = 1`).bind(applicationFacts, updatedAt),
          ...defaultApprovalItems.map((item) => db.prepare(`UPDATE approval_items SET
            target = ?, payload_preview = ?, source_url = ?, readiness = ?, blocker = ?
            WHERE id = ? AND status = 'pending'`).bind(
              item.target || null,
              item.preview,
              'sourceUrl' in item ? item.sourceUrl : null,
              item.readiness,
              item.blocker || null,
              item.id,
            )),
          db.prepare(`INSERT OR IGNORE INTO activity_events
            (id, run_id, event_type, label, detail, occurred_at)
            VALUES (?, NULL, 'policy_updated', 'Review-first daily preparation confirmed', ?, ?)`).bind(
              verifiedProfileUpdateId,
              'Daily 9:00 AM preparation queues 10 verified-email leads and 5 truthful Wellfound applications. Unapproved batches remain queued and accumulate; external actions require owner approval.',
              updatedAt,
            ),
        ];
        await db.batch(policyUpdates);
      }
      await db.prepare('PRAGMA optimize').run();
    })().catch((error) => {
      initialization = null;
      throw error;
    });
  }
  await initialization;
}

export async function getSettings() {
  await ensureDatabase();
  return database().prepare('SELECT * FROM control_settings WHERE id = 1').first<ControlSettings>();
}

export function missingActivationRules(settings: ControlSettings) {
  const required: Array<[keyof ControlSettings, string]> = [
    ['target_markets', 'target markets'],
    ['ideal_customer_profile', 'ideal customer profile'],
    ['lead_titles', 'lead titles'],
    ['wellfound_roles', 'Wellfound role filters'],
    ['wellfound_locations', 'Wellfound location filters'],
    ['application_facts', 'truthful application facts'],
  ];
  const missing = required.filter(([key]) => !String(settings[key] ?? '').trim()).map(([, label]) => label);
  if (settings.automation_mode === 'paused') missing.unshift('automation mode');
  return missing;
}

export function mondayStartIso() {
  const now = new Date();
  const day = now.getUTCDay();
  const distance = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - distance));
  return monday.toISOString();
}

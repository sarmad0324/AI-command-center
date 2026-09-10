import { env } from 'cloudflare:workers';
import { defaultConnections, schemaStatements } from './schema';

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
      const servicePolicyId = 'policy-update-20260908-founder-services-v1';
      const servicePolicyApplied = await db.prepare('SELECT id FROM activity_events WHERE id = ?').bind(servicePolicyId).first();
      if (!servicePolicyApplied) {
        const updatedAt = new Date().toISOString();
        await db.batch([
          db.prepare(`UPDATE control_settings SET
            automation_mode = 'scheduled', approval_policy = 'review_first', timezone = 'Asia/Karachi',
            schedule_hour = 9, lead_target = 10, email_cap = 10, application_cap = 5,
            followup_days = '6,10,15,30,45',
            target_markets = ?, ideal_customer_profile = ?, lead_titles = ?, min_compensation = ?,
            notification_email = 'sarmad@sarmadirfan.com', updated_at = ? WHERE id = 1`).bind(
              'Tier 1 (at least 70%): logistics, fleet, freight, transportation, field-service, and operational software in US Central/Eastern, UAE/GCC, UK/EU, then Canada/Australia. Tier 2 (maximum 30%): operational B2B SaaS with a strong verified trigger.',
              'Founder-led software company with a live product or working MVP; normally 3-50 employees (up to 120 only for exceptional Tier 1 fit), 0-6 engineers, funded or revenue-backed, and a current need for product audit, MVP delivery, stabilization, technical ownership, or fundraising readiness. Exclude consumer, social, dating, gaming, crypto/Web3, agencies, dev shops, brochure/WordPress work, pre-idea products, on-site roles, and generic AI wrappers.',
              'Named Founder, Co-Founder, CEO, CTO, Head of Product, or Product Lead. A verified personal decision-maker email and recent source URL are mandatory; role inboxes are prohibited.',
              'Service outreach must have a credible budget. Reject unpaid, equity-only, or sub-$1,000 service opportunities. Wellfound compensation remains evaluated separately and truthfully.',
              updatedAt,
            ),
          db.prepare(`INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
            VALUES (?, NULL, 'policy_updated', 'Founder service outreach policy activated', ?, ?)`).bind(
              servicePolicyId,
              'Founder outreach now uses service-provider positioning from sarmad@sarmadirfan.com with a 10-email daily cap. Wellfound remains a separate truthful application channel capped at 5 per day.',
              updatedAt,
            ),
        ]);
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

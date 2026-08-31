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

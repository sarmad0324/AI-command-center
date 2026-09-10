export const SALES_POLICY = {
  sender: 'sarmad@sarmadirfan.com',
  dailyEmailCap: 10,
  dailyApplicationCap: 5,
  minimumScore: 65,
  approvalMaxAgeHours: 72,
  followupDays: '6,10,15,30,45',
} as const;

const roleInbox = /^(careers|jobs|hr|hello|info|contact|support|team|teams|admin|sales|press|marketing|billing|noreply|no-reply)([+._-]|@)/i;
const candidateLanguage = /\b(founding engineer|join(?:ing)? (?:your|the) team|job opportunity|open position|available for hire|resume|curriculum vitae|\bCV\b|employment|equity role)\b/i;
const jobTitleSubject = /\b(engineer|developer|cto|co-founder|cofounder|candidate|application|role|position)\b/i;
const url = /(?:https?:\/\/|www\.)\S+/i;

export function validPersonalEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !roleInbox.test(email);
}

export function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function validateFounderEmail(input: {
  target?: unknown;
  contactName?: unknown;
  subject?: unknown;
  body?: unknown;
  sourceUrl?: unknown;
  qualificationScore?: unknown;
  createdAt?: unknown;
  lastContactAt?: unknown;
  leadStatus?: unknown;
}) {
  const problems: string[] = [];
  const target = String(input.target ?? '').trim();
  const contactName = String(input.contactName ?? '').trim();
  const subject = String(input.subject ?? '').trim();
  const body = String(input.body ?? '').trim();
  const sourceUrl = String(input.sourceUrl ?? '').trim();
  const score = Number(input.qualificationScore);
  const createdAt = Date.parse(String(input.createdAt ?? ''));
  const lastContactAt = Date.parse(String(input.lastContactAt ?? ''));
  const leadStatus = String(input.leadStatus ?? '').toLowerCase();

  if (!validPersonalEmail(target)) problems.push('A verified personal decision-maker email is required; role inboxes are not allowed.');
  if (!contactName) problems.push('A named decision maker is required.');
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) problems.push('A verifiable trigger URL is required.');
  if (!Number.isFinite(score) || score < SALES_POLICY.minimumScore) problems.push(`Qualification score must be at least ${SALES_POLICY.minimumScore}.`);
  if (!subject || candidateLanguage.test(subject) || jobTitleSubject.test(subject)) problems.push('The subject must be company-specific service outreach, not job or candidate language.');
  if (candidateLanguage.test(body)) problems.push('Cold founder outreach cannot use candidate or employment framing.');
  const words = wordCount(body);
  if (words < 70 || words > 130) problems.push('The first email must contain 70–130 words.');
  if (url.test(body)) problems.push('The first email cannot contain links.');
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > SALES_POLICY.approvalMaxAgeHours * 3_600_000) problems.push('Research or approval is older than 72 hours and must be refreshed.');
  if (Number.isFinite(lastContactAt) && Date.now() - lastContactAt < 120 * 86_400_000) problems.push('This contact was contacted within the last 120 days.');
  if (/do_not_contact|replied|active_client|active_conversation|bounced/.test(leadStatus)) problems.push('This contact is suppressed by the CRM status.');
  return problems;
}


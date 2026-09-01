UPDATE control_settings
SET
  automation_mode = 'scheduled',
  timezone = 'Asia/Karachi',
  schedule_hour = 21,
  lead_target = 10,
  email_cap = 10,
  application_cap = 5,
  followup_days = '3,6,10,15,21,30,45',
  target_markets = 'International, remote-first startup founders and product companies',
  ideal_customer_profile = 'Early-stage founder-led software companies with 1-50 employees, an MVP or live product, and a need for hands-on technical ownership, a founding engineer, technical co-founder, CTO partner, product audit, MVP delivery, stabilization, or fundraising readiness',
  lead_titles = 'Founder, Co-Founder, CEO, CTO, Head of Product, Product Lead',
  wellfound_roles = 'Technical Co-Founder, Co-Founder, Founding Engineer, CTO, Senior Software Engineer, Senior Full-Stack Engineer, Full-Stack Engineer, Backend Engineer, Frontend Engineer, Product Engineer, Software Engineer, Data Scientist',
  wellfound_locations = 'Remote only; use the existing saved Wellfound region set shown as Japan +10; company size 1-10 or 11-50; any salary; any equity; no investment-stage restriction',
  min_compensation = 'Any salary and any equity. Reject equity-only service engagements and clearly low-budget work; do not invent compensation answers in applications.',
  application_facts = 'Sarmad Irfan; Lahore, Pakistan; remote and international; Technical Partner / Product Engineer; final-year university student; React, Next.js, TypeScript, React Native, Expo, Node.js, Express, PostgreSQL, Supabase, Firebase, Docker, GitHub, CI/CD, cloud deployment, APIs, authentication, RBAC, and system architecture; website https://www.sarmadirfan.com/; more than two years of technical ownership on TruckWise. Do not invent years beyond that evidence, compensation expectations, availability, work authorization, degree completion, or any answer not explicitly verified.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

UPDATE connection_status
SET detail = 'The signed-in browser session is available for qualified remote engineering and founding-team discovery. Final application submission remains approval-gated.'
WHERE id = 'wellfound';

INSERT INTO activity_events (id, run_id, event_type, label, detail, occurred_at)
VALUES (
  lower(hex(randomblob(16))),
  NULL,
  'policy_updated',
  'Daily sales policy activated',
  'Scheduled for 9:00 PM Asia/Karachi: 10 founder leads, 10 personalized emails, 5 Wellfound opportunities, and follow-ups on days 3, 6, 10, 15, 21, 30, and 45.',
  CURRENT_TIMESTAMP
);

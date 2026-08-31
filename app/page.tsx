'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type View = 'Today' | 'Sales' | 'Applications' | 'Replies' | 'Runs' | 'Connections' | 'Settings';

type Settings = {
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

type Connection = { id: string; name: string; channel: string; status: string; identity: string; detail: string; checked_at: string; action_url?: string };
type Run = { id: string; run_type: string; status: string; requested_at: string; started_at?: string; completed_at?: string; lead_target: number; email_cap: number; application_cap: number; leads_found: number; leads_qualified: number; emails_sent: number; followups_sent: number; applications_submitted: number; replies_detected: number; summary?: string; blocker?: string };
type Lead = { id: string; company: string; contact_name: string; title: string; email?: string; source: string; qualification_score?: number; status: string; created_at: string; next_followup_at?: string };
type Application = { id: string; company: string; role: string; source_url?: string; fit_score?: number; status: string; applied_at?: string; created_at: string };
type Reply = { id: string; channel: string; sender_name: string; sender_address?: string; subject: string; sentiment: string; received_at: string; status: string };
type Activity = { id: string; event_type: string; label: string; detail: string; occurred_at: string };
type DashboardData = { generatedAt: string; metrics: Record<string, number | null>; week: Record<string, number | null>; queue: Record<string, number | null>; settings: Settings; setupMissing: string[]; connections: Connection[]; runs: Run[]; leads: Lead[]; applications: Application[]; replies: Reply[]; activity: Activity[]; sheetUrl: string };

const navItems: Array<{ label: View; icon: string }> = [
  { label: 'Today', icon: '⌂' }, { label: 'Sales', icon: '↗' }, { label: 'Applications', icon: '◎' },
  { label: 'Replies', icon: '✉' }, { label: 'Runs', icon: '▶' }, { label: 'Connections', icon: '◇' }, { label: 'Settings', icon: '⚙' },
];

const viewMeta: Record<View, { eyebrow: string; title: string; description: string }> = {
  Today: { eyebrow: 'Company OS · Live control plane', title: 'Your AI sales command center', description: 'Queue work, watch the pipeline, and hand replies back to yourself from one private dashboard.' },
  Sales: { eyebrow: 'Lead generation and outreach', title: 'Live sales pipeline', description: 'Only real prospects reported by the execution agent appear here.' },
  Applications: { eyebrow: 'Wellfound job applications', title: 'Application tracker', description: 'Qualified roles and truthful submissions are tracked from discovery to response.' },
  Replies: { eyebrow: 'Human handoff queue', title: 'Replies that need you', description: 'Automation pauses for a contact as soon as a genuine reply is detected.' },
  Runs: { eyebrow: 'AI execution history', title: 'Sales run ledger', description: 'Every manual and scheduled request has a durable status, counts, and outcome.' },
  Connections: { eyebrow: 'Integration control center', title: 'Connected operating accounts', description: 'Direct connectors and signed-in browser sessions are shown separately and checked by the worker.' },
  Settings: { eyebrow: 'Automation policy', title: 'Targeting, limits, and truth rules', description: 'These settings are the contract the AI worker must follow on every run.' },
};

export default function Home() {
  const [view, setView] = useState<View>('Today');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!response.ok) throw new Error('The live dashboard could not be loaded.');
      setData(await response.json() as DashboardData);
      setError('');
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : 'The live dashboard could not be loaded.');
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(true), 15000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [refresh]);

  async function queueRun(runType: 'full_sales_cycle' | 'connection_check' = 'full_sales_cycle') {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runType }) });
      const payload = await response.json() as { error?: string; missing?: string[]; run?: Run };
      if (!response.ok) {
        if (payload.run?.blocker) throw new Error(payload.run.blocker);
        const detail = payload.missing?.length ? ` Complete: ${payload.missing.join(', ')}.` : '';
        throw new Error(`${payload.error ?? 'The request needs attention.'}${detail}`);
      }
      setNotice(runType === 'connection_check' ? 'Connection check queued.' : 'Sales run queued for the AI worker.');
      setView('Runs'); await refresh(true);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'The request could not be queued.');
      await refresh(true);
    } finally { setBusy(false); }
  }

  function navigate(next: View) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  const activeCount = number(data?.queue?.queued) + number(data?.queue?.running);
  const ready = Boolean(data && data.setupMissing.length === 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>Sarmad OS</strong><span>AI sales command center</span></div></div>
        <nav aria-label="Primary navigation"><p className="nav-label">Workspace</p>{navItems.map((item) => (
          <button className={`nav-item ${view === item.label ? 'active' : ''}`} key={item.label} onClick={() => navigate(item.label)} type="button">
            <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
            {item.label === 'Replies' && number(data?.metrics?.replies) > 0 ? <span className="nav-count">{number(data?.metrics?.replies)}</span> : null}
            {item.label === 'Runs' && activeCount > 0 ? <span className="nav-count">{activeCount}</span> : null}
          </button>
        ))}</nav>
        <div className="sidebar-bottom"><div className="system-status"><span className={`status-dot ${ready ? '' : 'blocked'}`} /><div><strong>{ready ? 'Ready for manual runs' : 'Setup required'}</strong><span>{activeCount ? `${activeCount} active request${activeCount === 1 ? '' : 's'}` : 'No active request'}</span></div></div><div className="profile"><span className="avatar">SI</span><span><strong>Sarmad Irfan</strong><small>Technical Partner</small></span></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="title-block"><span className="eyebrow">{viewMeta[view].eyebrow}</span><h1>{viewMeta[view].title}</h1><p>{viewMeta[view].description}</p></div><div className="topbar-actions"><span className="live-chip">{data ? `Updated ${relativeTime(data.generatedAt)}` : 'Connecting…'}</span><button className="primary-button run-button" disabled={busy || !data} onClick={() => void queueRun()} type="button"><span>▶</span>{busy ? 'Queuing…' : 'Run My Sales Lead'}</button></div></header>
        <div className="content">
          {error ? <div className="alert error"><strong>Live data unavailable</strong><span>{error}</span><button onClick={() => void refresh()} type="button">Retry</button></div> : null}
          {notice ? <div className="alert notice"><span>{notice}</span><button onClick={() => setNotice('')} type="button">Dismiss</button></div> : null}
          {!data ? <LoadingState /> : null}
          {data && view === 'Today' ? <TodayView data={data} onConfigure={() => navigate('Settings')} onRun={() => void queueRun()} busy={busy} /> : null}
          {data && view === 'Sales' ? <SalesView leads={data.leads} /> : null}
          {data && view === 'Applications' ? <ApplicationsView applications={data.applications} /> : null}
          {data && view === 'Replies' ? <RepliesView replies={data.replies} /> : null}
          {data && view === 'Runs' ? <RunsView runs={data.runs} /> : null}
          {data && view === 'Connections' ? <ConnectionsView connections={data.connections} sheetUrl={data.sheetUrl} onCheck={() => void queueRun('connection_check')} busy={busy} /> : null}
          {data && view === 'Settings' ? <SettingsView key={data.settings.updated_at} settings={data.settings} missing={data.setupMissing} onSaved={async () => { setNotice('Automation policy saved.'); await refresh(true); }} /> : null}
        </div>
      </section>
    </main>
  );
}

function TodayView({ data, onConfigure, onRun, busy }: { data: DashboardData; onConfigure: () => void; onRun: () => void; busy: boolean }) {
  const ready = data.setupMissing.length === 0; const latestRun = data.runs[0];
  return <>
    <section className={`setup-banner ${ready ? 'connected' : ''}`} aria-label="Activation status"><div className="critical-icon">{ready ? '✓' : '!'}</div><div className="critical-copy"><span>{ready ? 'Control plane ready' : 'Activation rules incomplete'}</span><strong>{ready ? 'Manual sales runs can now be queued.' : `${data.setupMissing.length} operating rule${data.setupMissing.length === 1 ? '' : 's'} still need your input.`}</strong><p>{ready ? 'The execution worker must be active to claim queued work. Scheduled execution is added after the first controlled run.' : `Missing: ${data.setupMissing.join(', ')}.`}</p></div><button className="secondary-button" onClick={ready ? onRun : onConfigure} disabled={busy} type="button">{ready ? 'Run now' : 'Complete settings'}</button></section>
    <section className="metrics four" aria-label="All-time automation snapshot"><Metric label="Live leads" value={number(data.metrics.leads)} note={`${number(data.week.leads)} this week`} /><Metric label="Emails + follow-ups" value={number(data.metrics.emails)} note={`${number(data.week.emails)} this week`} /><Metric label="Applications" value={number(data.metrics.applications)} note={`${number(data.week.applications)} this week`} /><Metric label="Replies needing you" value={number(data.metrics.replies)} note={`${number(data.week.replies)} received this week`} /></section>
    <div className="main-grid live-grid"><section className="panel run-control"><PanelHeading eyebrow="AI sales cycle" title="One request, one auditable run" note={ready ? 'Policy ready' : 'Waiting for your filters'} /><div className="run-flow">{['Discover 5–10 leads', 'Qualify and deduplicate', 'Update CRM + Sheet', 'Send within cap', 'Run due follow-ups', 'Apply to matched jobs', 'Stop and notify on reply'].map((step, index) => <div key={step}><b>{index + 1}</b><span>{step}</span></div>)}</div><div className="run-actions"><button className="primary-button" disabled={busy} onClick={onRun} type="button"><span>▶</span>{busy ? 'Queuing…' : 'Run My Sales Lead'}</button><span>Every request is persisted before any external action begins.</span></div></section><section className="panel status-panel"><PanelHeading eyebrow="Latest request" title={latestRun ? humanStatus(latestRun.status) : 'No run yet'} note={latestRun ? formatDate(latestRun.requested_at) : 'Live records only'} />{latestRun ? <RunSummary run={latestRun} /> : <EmptyMini icon="▶" title="Your run history is empty" text="Complete the policy, then use the run button to create the first real request." />}</section></div>
    <section className="panel activity-panel"><PanelHeading eyebrow="System activity" title="Recent events" note="Refreshes every 15 seconds" />{data.activity.length ? <div className="activity-list">{data.activity.map((item) => <div key={item.id}><span className={`event-dot ${item.event_type}`} /><div><strong>{item.label}</strong><p>{item.detail}</p></div><time>{relativeTime(item.occurred_at)}</time></div>)}</div> : <EmptyMini icon="·" title="No activity yet" text="Run requests, connector checks, sends, applications, and replies will appear here." />}</section>
  </>;
}

function SalesView({ leads }: { leads: Lead[] }) { return <RegisterTable title="Lead register" emptyTitle="No live leads yet" emptyText="The first qualified prospects will appear after an AI worker completes a sales run." headers={['Company', 'Contact', 'Source', 'Score', 'Status', 'Next follow-up']} rows={leads.map((lead) => [lead.company, `${lead.contact_name} · ${lead.title}`, lead.source, lead.qualification_score ?? '—', humanStatus(lead.status), lead.next_followup_at ? formatDate(lead.next_followup_at) : '—'])} />; }
function ApplicationsView({ applications }: { applications: Application[] }) { return <RegisterTable title="Wellfound applications" emptyTitle="No live applications yet" emptyText="Only roles that pass the saved filters and truthful application checks will appear." headers={['Company', 'Role', 'Fit', 'Status', 'Applied', 'Source']} rows={applications.map((application) => [application.company, application.role, application.fit_score ?? '—', humanStatus(application.status), application.applied_at ? formatDate(application.applied_at) : 'Not submitted', application.source_url ? <a href={application.source_url} key={application.id} rel="noreferrer" target="_blank">Open role</a> : 'Wellfound'])} />; }
function RepliesView({ replies }: { replies: Reply[] }) { return <RegisterTable title="Reply handoff queue" emptyTitle="Your handoff queue is clear" emptyText="When a prospect or employer replies, automation pauses for that thread and routes it here." headers={['From', 'Subject', 'Channel', 'Sentiment', 'Received', 'Status']} rows={replies.map((reply) => [`${reply.sender_name}${reply.sender_address ? ` · ${reply.sender_address}` : ''}`, reply.subject, reply.channel, humanStatus(reply.sentiment), formatDate(reply.received_at), humanStatus(reply.status)])} />; }

function RunsView({ runs }: { runs: Run[] }) { return <section className="panel table-panel"><PanelHeading eyebrow="Durable execution ledger" title="Run history" note={`${runs.length} recent request${runs.length === 1 ? '' : 's'}`} />{runs.length ? <div className="run-list">{runs.map((run) => <article key={run.id}><div className="run-list-head"><div><span>{run.run_type === 'connection_check' ? 'Connection check' : 'Full sales cycle'}</span><strong>{formatDate(run.requested_at)}</strong></div><StatusPill status={run.status} /></div><RunSummary run={run} /></article>)}</div> : <EmptyMini icon="▶" title="No run requests yet" text="The first request will be recorded here before the worker takes any action." />}</section>; }

function ConnectionsView({ connections, sheetUrl, onCheck, busy }: { connections: Connection[]; sheetUrl: string; onCheck: () => void; busy: boolean }) { return <><div className="connection-toolbar"><div><strong>{connections.filter((item) => item.status === 'connected').length}/{connections.length} connected</strong><span>Connector health is written back by the execution worker.</span></div><button className="primary-button" disabled={busy} onClick={onCheck} type="button"><span>↻</span>{busy ? 'Queuing…' : 'Queue connection check'}</button></div><section className="connection-grid">{connections.map((connection) => <article className="panel connection-card" key={connection.id}><div className="connection-head"><div className="service-mark">{connection.name.slice(0, 1)}</div><span className={`connection-status ${connection.status}`}>{humanStatus(connection.status)}</span></div><h2>{connection.name}</h2><strong>{connection.channel}</strong><p>{connection.detail}</p><small>{connection.identity}</small><a className="connection-action" href={connection.id === 'google-sheets' ? sheetUrl : connection.action_url} rel="noreferrer" target="_blank">Open {connection.name}</a></article>)}<p className="connection-note">Passwords and browser cookies are never stored in this dashboard. Gmail, Apollo, and Sheets use direct connectors; LinkedIn and Wellfound use Sarmad’s signed-in browser sessions.</p></section></>; }

function SettingsView({ settings, missing, onSaved }: { settings: Settings; missing: string[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(settings); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setMessage(''); try { const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const payload = await response.json() as { error?: string; setupMissing?: string[] }; if (!response.ok) throw new Error(payload.error ?? 'Settings could not be saved.'); setMessage(payload.setupMissing?.length ? `Saved. Still missing: ${payload.setupMissing.join(', ')}.` : 'Saved. Manual runs are ready to queue.'); await onSaved(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Settings could not be saved.'); } finally { setSaving(false); } }
  function update<K extends keyof Settings>(key: K, value: Settings[K]) { setForm((current) => ({ ...current, [key]: value })); }
  return <form className="settings-form" onSubmit={submit}>
    {missing.length ? <div className="alert notice"><span><strong>Activation checklist:</strong> {missing.join(', ')}.</span></div> : <div className="alert success"><span><strong>Policy complete.</strong> The next manual request can enter the execution queue.</span></div>}
    <section className="panel settings-section"><PanelHeading eyebrow="Run controls" title="Volume and schedule" note="Conservative starting caps" /><div className="form-grid four-fields"><Field label="Mode"><select value={form.automation_mode} onChange={(event) => update('automation_mode', event.target.value as Settings['automation_mode'])}><option value="paused">Paused</option><option value="manual">Manual runs</option><option value="scheduled">Scheduled + manual (worker required)</option></select></Field><Field label="Lead target"><input min="1" max="25" type="number" value={form.lead_target} onChange={(event) => update('lead_target', Number(event.target.value))} /></Field><Field label="Daily email cap"><input min="0" max="25" type="number" value={form.email_cap} onChange={(event) => update('email_cap', Number(event.target.value))} /></Field><Field label="Daily application cap"><input min="0" max="10" type="number" value={form.application_cap} onChange={(event) => update('application_cap', Number(event.target.value))} /></Field><Field label="Schedule hour"><input min="0" max="23" type="number" value={form.schedule_hour} onChange={(event) => update('schedule_hour', Number(event.target.value))} /></Field><Field label="Timezone"><input value={form.timezone} onChange={(event) => update('timezone', event.target.value)} /></Field><Field label="Follow-up days"><input value={form.followup_days} onChange={(event) => update('followup_days', event.target.value)} placeholder="4,8,14" /></Field><Field label="Minimum compensation"><input value={form.min_compensation} onChange={(event) => update('min_compensation', event.target.value)} placeholder="Optional" /></Field></div></section>
    <section className="panel settings-section"><PanelHeading eyebrow="Lead generation" title="Ideal customer and buyer filters" note="Used by Apollo + LinkedIn research" /><div className="form-grid two-fields"><Field label="Target markets"><textarea value={form.target_markets} onChange={(event) => update('target_markets', event.target.value)} placeholder="Countries, regions, industries, company stages…" /></Field><Field label="Ideal customer profile"><textarea value={form.ideal_customer_profile} onChange={(event) => update('ideal_customer_profile', event.target.value)} placeholder="What makes a founder or product a strong fit?" /></Field><Field label="Buyer / lead titles"><textarea value={form.lead_titles} onChange={(event) => update('lead_titles', event.target.value)} placeholder="Founder, CEO, CTO, Head of Product…" /></Field></div></section>
    <section className="panel settings-section"><PanelHeading eyebrow="Wellfound" title="Role filters and truthful facts" note="No application may invent an answer" /><div className="form-grid two-fields"><Field label="Role keywords"><textarea value={form.wellfound_roles} onChange={(event) => update('wellfound_roles', event.target.value)} placeholder="Founding Engineer, Product Engineer, Fractional CTO…" /></Field><Field label="Locations and remote rules"><textarea value={form.wellfound_locations} onChange={(event) => update('wellfound_locations', event.target.value)} placeholder="Remote regions, time-zone overlap, excluded shifts…" /></Field><Field label="Verified application facts"><textarea className="tall" value={form.application_facts} onChange={(event) => update('application_facts', event.target.value)} placeholder="Experience, stack, location, availability, compensation, work authorization, portfolio links, and answers the agent may truthfully use." /></Field></div></section>
    <div className="settings-save"><div><strong>Safety contract</strong><span>Duplicate protection, opt-outs, reply handoff, and truthful applications remain mandatory.</span>{message ? <small>{message}</small> : null}</div><button className="primary-button" disabled={saving} type="submit"><span>✓</span>{saving ? 'Saving…' : 'Save operating policy'}</button></div>
  </form>;
}

function RegisterTable({ title, emptyTitle, emptyText, headers, rows }: { title: string; emptyTitle: string; emptyText: string; headers: string[]; rows: Array<Array<string | number | React.ReactNode>> }) { return <section className="panel table-panel"><PanelHeading eyebrow="Live register" title={title} note={`${rows.length} record${rows.length === 1 ? '' : 's'}`} />{rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <EmptyMini icon="·" title={emptyTitle} text={emptyText} />}</section>; }
function RunSummary({ run }: { run: Run }) { return <div className="run-summary"><div><span>Found</span><strong>{run.leads_found}</strong></div><div><span>Qualified</span><strong>{run.leads_qualified}</strong></div><div><span>Emails</span><strong>{run.emails_sent + run.followups_sent}</strong></div><div><span>Applied</span><strong>{run.applications_submitted}</strong></div><div><span>Replies</span><strong>{run.replies_detected}</strong></div>{run.blocker || run.summary ? <p>{run.blocker ?? run.summary}</p> : null}</div>; }
function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${status}`}>{humanStatus(status)}</span>; }
function EmptyMini({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className="empty-mini"><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div></div>; }
function LoadingState() { return <section className="panel loading-state"><span className="spinner" /><strong>Connecting to the live control plane…</strong></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Metric({ label, value, note }: { label: string; value: number; note: string }) { return <article className="metric-card"><span>{label}</span><strong>{value.toLocaleString()}</strong><small>{note}</small></article>; }
function PanelHeading({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) { return <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="small-note">{note}</span></div>; }
function number(value: number | null | undefined) { return Number(value ?? 0); }
function humanStatus(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function relativeTime(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 10) return 'just now'; if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }

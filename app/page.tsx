'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type View = 'Today' | 'Approvals' | 'Sales' | 'Applications' | 'Replies' | 'Runs' | 'Connections' | 'Settings';

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
  approval_policy: 'review_first' | 'automatic';
  notify_by_email: number;
  notification_email: string;
  updated_at: string;
};

type Connection = { id: string; name: string; channel: string; status: string; identity: string; detail: string; checked_at: string; action_url?: string };
type Run = { id: string; run_type: string; status: string; requested_at: string; started_at?: string; completed_at?: string; lead_target: number; email_cap: number; application_cap: number; leads_found: number; leads_qualified: number; emails_sent: number; followups_sent: number; applications_submitted: number; replies_detected: number; summary?: string; blocker?: string };
type Lead = { id: string; company: string; contact_name: string; title: string; email?: string; source: string; qualification_score?: number; status: string; created_at: string; next_followup_at?: string };
type Application = { id: string; company: string; role: string; source_url?: string; fit_score?: number; status: string; applied_at?: string; created_at: string };
type Reply = { id: string; channel: string; sender_name: string; sender_address?: string; subject: string; sentiment: string; received_at: string; status: string };
type Activity = { id: string; event_type: string; label: string; detail: string; occurred_at: string };
type ApprovalItem = { id: string; item_type: 'email' | 'application'; related_id: string; company: string; contact_name?: string; target?: string; subject: string; payload_preview: string; source_url?: string; readiness: 'ready' | 'blocked'; blocker?: string; status: string; created_at: string };
type DashboardData = { generatedAt: string; metrics: Record<string, number | null>; week: Record<string, number | null>; queue: Record<string, number | null>; approvalMetrics: Record<string, number | null>; settings: Settings; setupMissing: string[]; connections: Connection[]; runs: Run[]; leads: Lead[]; applications: Application[]; replies: Reply[]; activity: Activity[]; approvals: ApprovalItem[]; sheetUrl: string };

const navItems: Array<{ label: View; icon: string }> = [
  { label: 'Today', icon: '⌂' }, { label: 'Approvals', icon: '✓' }, { label: 'Sales', icon: '↗' }, { label: 'Applications', icon: '◎' },
  { label: 'Replies', icon: '✉' }, { label: 'Runs', icon: '▶' }, { label: 'Connections', icon: '◇' }, { label: 'Settings', icon: '⚙' },
];

const viewMeta: Record<View, { eyebrow: string; title: string; description: string }> = {
  Today: { eyebrow: 'Company OS · Live control plane', title: 'Your AI sales command center', description: 'Queue work, watch the pipeline, and hand replies back to yourself from one private dashboard.' },
  Approvals: { eyebrow: 'Owner authorization', title: 'Approval queue', description: 'Review the exact recipients and roles, then authorize every execution-ready item with one click.' },
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
  const [approvalIntent, setApprovalIntent] = useState<'email' | 'application' | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('The live dashboard could not be loaded.');
      setData(await readJson<DashboardData>(response));
      setError('');
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : 'The live dashboard could not be loaded.');
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(true); }, 30_000);
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refresh(true); };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener('focus', refreshVisible); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [refresh]);

  async function queueRun(runType: 'full_sales_cycle' | 'connection_check' = 'full_sales_cycle') {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runType }), signal: AbortSignal.timeout(15_000) });
      const payload = await readJson<{ error?: string; missing?: string[]; run?: Run }>(response);
      if (!response.ok) {
        if (payload.run?.blocker) throw new Error(payload.run.blocker);
        const detail = payload.missing?.length ? ` Complete: ${payload.missing.join(', ')}.` : '';
        throw new Error(`${payload.error ?? 'The request needs attention.'}${detail}`);
      }
      setNotice(runType === 'connection_check' ? 'Connection check queued.' : 'Sales run queued. The AI executor will start it automatically.');
      setView('Runs'); await refresh(true);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'The request could not be queued.');
      await refresh(true);
    } finally { setBusy(false); }
  }

  async function approveAndRun() {
    if (!approvalIntent) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_ready_and_run', itemType: approvalIntent }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await readJson<{ error?: string; emailCount?: number; applicationCount?: number }>(response);
      if (!response.ok) throw new Error(payload.error ?? 'The approval could not be recorded.');
      setNotice(`${payload.emailCount ?? 0} email(s) and ${payload.applicationCount ?? 0} application(s) approved. The executor will send and submit them automatically.`);
      setApprovalIntent(null); setView('Runs'); await refresh(true);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'The approval could not be recorded.');
    } finally { setBusy(false); }
  }

  function navigate(next: View) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  const activeCount = number(data?.queue?.queued) + number(data?.queue?.running);
  const policyReady = Boolean(data && data.setupMissing.length === 0);
  const ready = policyReady;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>Sarmad OS</strong><span>AI sales command center</span></div></div>
        <nav aria-label="Primary navigation"><p className="nav-label">Workspace</p>{navItems.map((item) => (
          <button className={`nav-item ${view === item.label ? 'active' : ''}`} key={item.label} onClick={() => navigate(item.label)} type="button">
            <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
            {item.label === 'Replies' && number(data?.metrics?.replies) > 0 ? <span className="nav-count">{number(data?.metrics?.replies)}</span> : null}
            {item.label === 'Approvals' && number(data?.approvalMetrics?.pending) > 0 ? <span className="nav-count">{number(data?.approvalMetrics?.pending)}</span> : null}
            {item.label === 'Runs' && activeCount > 0 ? <span className="nav-count">{activeCount}</span> : null}
          </button>
        ))}</nav>
        <div className="sidebar-bottom"><div className="system-status"><span className={`status-dot ${ready ? '' : 'blocked'}`} /><div><strong>{data?.settings.approval_policy === 'automatic' ? 'Automatic mode' : ready ? 'Review-first mode' : 'Setup required'}</strong><span>{activeCount ? `${activeCount} active request${activeCount === 1 ? '' : 's'}` : 'No active request'}</span></div></div><div className="profile"><span className="avatar">SI</span><span><strong>Sarmad Irfan</strong><small>Technical Partner</small></span></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="title-block"><span className="eyebrow">{viewMeta[view].eyebrow}</span><h1>{viewMeta[view].title}</h1><p>{viewMeta[view].description}</p></div><div className="topbar-actions"><span className="live-chip">{data ? `Updated ${relativeTime(data.generatedAt)}` : 'Connecting…'}</span><button className="secondary-ink-button" disabled={!data} onClick={() => navigate('Approvals')} type="button">Review approvals ({number(data?.approvalMetrics?.pending)})</button><button className="primary-button run-button" disabled={busy || !data} onClick={() => void queueRun()} type="button"><span>▶</span>{busy ? 'Queuing…' : 'Prepare daily batch'}</button></div></header>
        <div className="content">
          {error ? <div className="alert error"><strong>Live data unavailable</strong><span>{error}</span><button onClick={() => void refresh()} type="button">Retry</button></div> : null}
          {notice ? <div className="alert notice"><span>{notice}</span><button onClick={() => setNotice('')} type="button">Dismiss</button></div> : null}
          {!data ? <LoadingState /> : null}
          {data && view === 'Today' ? <TodayView data={data} onConfigure={() => navigate('Settings')} onApprovals={() => navigate('Approvals')} onRun={() => void queueRun()} busy={busy} /> : null}
          {data && view === 'Approvals' ? <ApprovalsView data={data} busy={busy} onApprove={setApprovalIntent} /> : null}
          {data && view === 'Sales' ? <SalesView leads={data.leads} /> : null}
          {data && view === 'Applications' ? <ApplicationsView applications={data.applications} /> : null}
          {data && view === 'Replies' ? <RepliesView replies={data.replies} /> : null}
          {data && view === 'Runs' ? <RunsView runs={data.runs} /> : null}
          {data && view === 'Connections' ? <ConnectionsView connections={data.connections} sheetUrl={data.sheetUrl} onCheck={() => void queueRun('connection_check')} busy={busy} /> : null}
          {data && view === 'Settings' ? <SettingsView key={data.settings.updated_at} settings={data.settings} missing={data.setupMissing} onSaved={async () => { setNotice('Automation policy saved.'); await refresh(true); }} /> : null}
        </div>
      </section>
      {data && approvalIntent ? <ApprovalModal items={data.approvals.filter((item) => item.status === 'pending' && item.readiness === 'ready' && item.item_type === approvalIntent)} scope={approvalIntent} busy={busy} onCancel={() => setApprovalIntent(null)} onConfirm={() => void approveAndRun()} /> : null}
    </main>
  );
}

function TodayView({ data, onConfigure, onApprovals, onRun, busy }: { data: DashboardData; onConfigure: () => void; onApprovals: () => void; onRun: () => void; busy: boolean }) {
  const policyReady = data.setupMissing.length === 0;
  const executorOnline = data.connections.find((item) => item.id === 'ai-executor')?.status === 'connected';
  const ready = policyReady;
  const latestRun = data.runs[0];
  return <>
    <section className={`setup-banner ${ready ? 'connected' : ''}`} aria-label="Activation status"><div className="critical-icon">{ready ? '✓' : '!'}</div><div className="critical-copy"><span>{ready ? 'Control plane ready' : 'Activation rules incomplete'}</span><strong>{ready ? `${number(data.approvalMetrics.pending)} items are waiting for your decision.` : `${data.setupMissing.length} operating rule${data.setupMissing.length === 1 ? '' : 's'} still need your input.`}</strong><p>{ready ? `${number(data.approvalMetrics.ready)} can execute now; ${number(data.approvalMetrics.blocked)} are held for missing facts. Worker status: ${executorOnline ? 'checked in' : 'waiting for next scheduled check-in'}.` : `Missing: ${data.setupMissing.join(', ')}.`}</p></div><button className="secondary-button" onClick={ready ? onApprovals : onConfigure} disabled={busy} type="button">{ready ? 'Review approvals' : 'Complete settings'}</button></section>
    <section className="metrics four" aria-label="Current sales snapshot"><Metric label="Qualified prospects" value={number(data.metrics.leads)} note={`${number(data.week.leads)} added this week`} /><Metric label="Replies needing you" value={number(data.metrics.replies)} note={`${number(data.week.replies)} received this week`} /><Metric label="Pending approvals" value={number(data.approvalMetrics.pending)} note={`${number(data.approvalMetrics.ready)} ready now`} /><Metric label="Wellfound applications" value={number(data.metrics.applications)} note={`${number(data.week.applications)} submitted this week`} /></section>
    <div className="main-grid live-grid"><section className="panel run-control"><PanelHeading eyebrow="AI sales cycle" title="Prepare one reviewable daily batch" note={ready ? 'Policy ready' : 'Waiting for your filters'} /><div className="run-flow">{['Find 10 niche prospects', 'Verify trigger + personal email', 'Draft service-provider outreach', 'Update CRM + Sheet', 'Prepare due email follow-ups', 'Prepare 5 Wellfound applications', 'Stop and notify on reply'].map((step, index) => <div key={step}><b>{index + 1}</b><span>{step}</span></div>)}</div><div className="run-actions"><button className="primary-button" disabled={busy} onClick={onRun} type="button"><span>▶</span>{busy ? 'Queuing…' : 'Prepare daily batch'}</button><span>Nothing is sent until you approve the email or application batch.</span></div></section><section className="panel status-panel"><PanelHeading eyebrow="Latest request" title={latestRun ? humanStatus(latestRun.status) : 'No run yet'} note={latestRun ? formatDate(latestRun.requested_at) : 'Live records only'} />{latestRun ? <RunSummary run={latestRun} /> : <EmptyMini icon="▶" title="Your run history is empty" text="Complete the policy, then prepare the first real batch." />}</section></div>
    <section className="panel activity-panel"><PanelHeading eyebrow="System activity" title="Recent events" note="Auto-refreshes every 30 seconds and after actions" />{data.activity.length ? <div className="activity-list">{data.activity.map((item) => <div key={item.id}><span className={`event-dot ${item.event_type}`} /><div><strong>{item.label}</strong><p>{item.detail}</p></div><time>{relativeTime(item.occurred_at)}</time></div>)}</div> : <EmptyMini icon="·" title="No activity yet" text="Run requests, connector checks, sends, applications, and replies will appear here." />}</section>
  </>;
}

function ApprovalsView({ data, busy, onApprove }: { data: DashboardData; busy: boolean; onApprove: (scope: 'email' | 'application') => void }) {
  const pending = data.approvals.filter((item) => item.status === 'pending');
  const readyEmails = pending.filter((item) => item.item_type === 'email' && item.readiness === 'ready').length;
  const readyApplications = pending.filter((item) => item.item_type === 'application' && item.readiness === 'ready').length;
  return <>
    <section className="approval-safety"><span>Approval status</span><strong>{data.settings.approval_policy === 'automatic' ? 'Automatic daily execution is enabled' : 'Review-first mode is active'}</strong><p>A click authorizes only execution-ready items. Missing addresses or applicant facts remain blocked and cannot be sent.</p></section>
    <section className="approval-toolbar panel"><div><strong>{pending.length} awaiting decision</strong><span>{readyEmails + readyApplications} ready · {pending.length - readyEmails - readyApplications} blocked</span></div><div><button className="primary-button" disabled={busy || readyEmails === 0} onClick={() => onApprove('email')} type="button"><span>✉</span>Approve &amp; send {readyEmails} email{readyEmails === 1 ? '' : 's'}</button><button className="primary-button" disabled={busy || readyApplications === 0} onClick={() => onApprove('application')} type="button"><span>✓</span>Approve &amp; submit {readyApplications} application{readyApplications === 1 ? '' : 's'}</button></div></section>
    <section className="approval-list">{pending.map((item) => <article className={`panel approval-row-card ${item.readiness}`} key={item.id}><div className="approval-row-head"><span>{item.item_type === 'email' ? 'Gmail outreach' : 'Wellfound application'}</span><span className={`readiness-chip ${item.readiness}`}>{item.readiness === 'ready' ? 'Ready to execute' : 'Blocked'}</span></div><h2>{item.subject}</h2><p>{item.contact_name ? `${item.contact_name} · ` : ''}{item.company}</p><div className="approval-context">{item.payload_preview}</div><dl className="approval-details"><div><dt>Destination</dt><dd>{item.target || 'Not verified'}</dd></div><div><dt>Decision</dt><dd>{item.status}</dd></div></dl>{item.blocker ? <div className="blocker-note"><strong>Needs attention</strong><span>{item.blocker}</span></div> : <div className="ready-note">All currently required execution facts are present.</div>}<div className="approval-links">{item.source_url ? <a href={item.source_url} rel="noreferrer" target="_blank">Open role</a> : null}<a href={data.sheetUrl} rel="noreferrer" target="_blank">Open full draft in Sheet</a></div></article>)}</section>
  </>;
}

function ApprovalModal({ items, scope, busy, onCancel, onConfirm }: { items: ApprovalItem[]; scope: 'email' | 'application'; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const emails = items.filter((item) => item.item_type === 'email').length;
  const applications = items.filter((item) => item.item_type === 'application').length;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}><section aria-labelledby="approval-title" aria-modal="true" className="modal" role="dialog"><div className="modal-head"><div><span className="eyebrow">Final authorization</span><h2 id="approval-title">Approve and queue this batch?</h2></div><button aria-label="Close" onClick={onCancel} type="button">×</button></div><div className="modal-warning"><strong>This click records your action-time approval.</strong><span>The worker may send the listed emails or submit the listed applications. Blocked items are excluded. Future daily batches still require your approval.</span></div><dl className="modal-facts"><div><dt>Emails</dt><dd>{emails}</dd></div><div><dt>Applications</dt><dd>{applications}</dd></div><div><dt>Scope</dt><dd>{humanStatus(scope)}</dd></div></dl><div className="modal-item-list">{items.map((item) => <div key={item.id}><strong>{item.subject}</strong><span>{item.target || item.company}</span></div>)}</div><div className="modal-actions"><button className="secondary-ink-button" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className="primary-button" disabled={busy || items.length === 0} onClick={onConfirm} type="button"><span>✓</span>{busy ? 'Authorizing…' : 'Approve & queue execution'}</button></div></section></div>;
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
    <section className="panel settings-section"><PanelHeading eyebrow="Run controls" title="Volume and schedule" note="Review-first daily preparation" /><div className="form-grid four-fields"><Field label="Mode"><select value={form.automation_mode} onChange={(event) => update('automation_mode', event.target.value as Settings['automation_mode'])}><option value="paused">Paused</option><option value="manual">Manual runs</option><option value="scheduled">Scheduled + manual</option></select></Field><Field label="Approval policy"><select disabled value="review_first"><option value="review_first">Review every batch</option></select></Field><Field label="Sending mailbox"><input disabled value="sarmad@sarmadirfan.com" /></Field><Field label="Lead target"><input min="1" max="25" type="number" value={form.lead_target} onChange={(event) => update('lead_target', Number(event.target.value))} /></Field><Field label="Daily email cap"><input disabled type="number" value="10" /></Field><Field label="Daily application cap"><input disabled type="number" value="5" /></Field><Field label="Schedule hour"><input min="0" max="23" type="number" value={form.schedule_hour} onChange={(event) => update('schedule_hour', Number(event.target.value))} /></Field><Field label="Timezone"><input value={form.timezone} onChange={(event) => update('timezone', event.target.value)} /></Field><Field label="Email follow-up days"><input value={form.followup_days} onChange={(event) => update('followup_days', event.target.value)} placeholder="6,10,15,30,45" /></Field><Field label="Minimum compensation"><input value={form.min_compensation} onChange={(event) => update('min_compensation', event.target.value)} placeholder="Optional" /></Field></div></section>
    <section className="panel settings-section"><PanelHeading eyebrow="Notifications" title="Reply alerts" note="Dashboard + Gmail" /><div className="form-grid two-fields"><Field label="Notification email"><input type="email" value={form.notification_email} onChange={(event) => update('notification_email', event.target.value)} /></Field><label className="automatic-option compact"><input checked={Boolean(form.notify_by_email)} onChange={(event) => update('notify_by_email', event.target.checked ? 1 : 0)} type="checkbox" /><span><strong>Email me when a genuine reply needs me</strong><small>The reply also appears in the dashboard and its future follow-ups are paused.</small></span></label></div></section>
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
async function readJson<T>(response: Response): Promise<T> { const raw = await response.text(); if (!raw) return {} as T; try { return JSON.parse(raw) as T; } catch { throw new Error('The server returned an incomplete response. Please retry once.'); } }

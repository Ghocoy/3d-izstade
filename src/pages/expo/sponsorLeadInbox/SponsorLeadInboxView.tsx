import { useEffect, useMemo } from 'react';
import { buildReleaseLoginHref } from '../../../config/releaseRouteOwnership';
import '../../../components/calculator/styles/CalculatorPro.css';
import {
  updateSponsorLeadInboxOps,
  updateSponsorLeadInboxStatus,
  type SponsorLeadInboxLead,
  type SponsorLeadInboxResponse,
  type SponsorLeadStatus,
} from '../../../modules/expo/services/sponsorLeadInboxClient';
import {
  buildSponsorLeadCopySummary,
  serializeSponsorLeadCsv,
} from '../../../app/expo/sponsorLeadExport';
import {
  appendSponsorLeadOpsNote,
  buildSponsorLeadReplyDraft,
  buildSponsorLeadReplySentNote,
  getLatestSponsorLeadReplySentAt,
  type SponsorLeadReplyDraft,
} from '../../../app/expo/sponsorLeadReply';
import {
  getSponsorLeadQualificationForMessage,
  getSponsorPackageLeadQualification,
} from '../../../app/expo/sponsorLeadQualification';
import { parseSponsorPackageLeadMessage } from '../../../app/expo/sponsorPackageLead';
import {
  SponsorLeadInboxAccessNotice,
  SponsorLeadInboxHero,
  SponsorLeadInboxMessage,
  SponsorLeadInboxPageHeader,
} from './SponsorLeadInboxSections';
import { useSponsorLeadInboxState } from './useSponsorLeadInboxState';

const STATUS_COLORS: Record<string, string> = {
  closed: '#34d399',
  contacted: '#93c5fd',
  pending: '#fbbf24',
  rejected: '#f87171',
};

const STATUS_LABELS: Record<SponsorLeadStatus, string> = {
  closed: 'Closed',
  contacted: 'Contacted',
  pending: 'Pending',
  rejected: 'Rejected',
};

const LEAD_PRIORITY_COLORS = {
  hot: '#fb7185',
  standard: '#94a3b8',
  warm: '#fbbf24',
} as const;

const PACKAGE_MIX_LABELS = [
  { color: '#facc15', key: 'landmark', label: 'Landmark' },
  { color: '#38bdf8', key: 'arena', label: 'Demo Arena' },
  { color: '#fb7185', key: 'premium', label: 'Premium' },
  { color: '#34d399', key: 'standard', label: 'Standard' },
  { color: '#94a3b8', key: 'other', label: 'Other' },
] as const;

type PackageMixKey = typeof PACKAGE_MIX_LABELS[number]['key'];

type InboxAccessState =
  | 'checking-auth'
  | 'ready'
  | 'signed-out'
  | 'access-denied'
  | 'backend-unavailable'
  | 'unavailable';

type LeadFilter = 'all' | 'follow-up-due' | 'hot-leads' | 'needs-action' | 'package-requests';

function formatDate(value?: string | null) {
  if (!value) {
    return 'No timestamp';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function normalizeStatus(lead: SponsorLeadInboxLead) {
  const status = String(lead.status || 'pending').toLowerCase();
  return STATUS_COLORS[status] ? status : 'pending';
}

function toDateTimeInputValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
}

function getTomorrowMorningFollowUpIso(now = new Date()) {
  const followUpAt = new Date(now);
  followUpAt.setDate(followUpAt.getDate() + 1);
  followUpAt.setHours(9, 0, 0, 0);
  return followUpAt.toISOString();
}

function getLeadFollowUpState(lead: SponsorLeadInboxLead, now = new Date()) {
  const normalizedStatus = normalizeStatus(lead);

  if (!lead.follow_up_at || normalizedStatus === 'closed' || normalizedStatus === 'rejected') {
    return 'none';
  }

  const followUpAt = new Date(lead.follow_up_at);
  if (Number.isNaN(followUpAt.getTime())) {
    return 'none';
  }

  return followUpAt.getTime() <= now.getTime() ? 'due' : 'scheduled';
}

function getPackageMixKey(packageInterest?: string | null): PackageMixKey {
  const value = String(packageInterest || '').toLowerCase();

  if (value.includes('landmark')) {
    return 'landmark';
  }

  if (value.includes('arena') || value.includes('demo battle')) {
    return 'arena';
  }

  if (value.includes('premium')) {
    return 'premium';
  }

  if (value.includes('standard')) {
    return 'standard';
  }

  return 'other';
}

function getPackageTierColor(packageInterest?: string | null) {
  const packageKey = getPackageMixKey(packageInterest);
  return PACKAGE_MIX_LABELS.find((item) => item.key === packageKey)?.color ?? '#94a3b8';
}

type LeadWorkflowStepState = 'active' | 'done' | 'next' | 'waiting';

type LeadWorkflowStep = {
  detail: string;
  label: string;
  state: LeadWorkflowStepState;
};

const WORKFLOW_STEP_COLORS: Record<LeadWorkflowStepState, string> = {
  active: '#38bdf8',
  done: '#34d399',
  next: '#fbbf24',
  waiting: '#64748b',
};

function getReplyPreviewLines(replyDraft: SponsorLeadReplyDraft) {
  return replyDraft.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildLeadWorkflowSteps({
  followUpState,
  hasPackageDetails,
  latestReplySentAt,
  status,
}: {
  followUpState: string;
  hasPackageDetails: boolean;
  latestReplySentAt: string | null;
  status: string;
}): LeadWorkflowStep[] {
  const isClosed = status === 'closed' || status === 'rejected';
  const hasReply = Boolean(latestReplySentAt);
  const hasFollowUp = followUpState !== 'none';

  return [
    {
      detail: hasPackageDetails ? 'Package, budget and timeline parsed.' : 'Review message and classify intent.',
      label: 'Qualify',
      state: hasPackageDetails ? 'done' : isClosed ? 'waiting' : 'active',
    },
    {
      detail: hasReply ? `Reply logged ${formatDate(latestReplySentAt)}.` : 'Copy or open the sponsor reply draft.',
      label: 'Reply',
      state: hasReply ? 'done' : isClosed ? 'waiting' : hasPackageDetails ? 'active' : 'next',
    },
    {
      detail: followUpState === 'due'
        ? 'Follow-up is due now.'
        : hasFollowUp
          ? 'Follow-up is scheduled.'
          : 'Set tomorrow follow-up after reply.',
      label: 'Follow-up',
      state: followUpState === 'due' ? 'active' : hasFollowUp ? 'done' : hasReply || status === 'contacted' ? 'active' : 'next',
    },
    {
      detail: isClosed ? `Outcome marked ${STATUS_LABELS[status as SponsorLeadStatus] ?? status}.` : 'Close or reject after sponsor outcome is clear.',
      label: 'Outcome',
      state: isClosed ? 'done' : status === 'contacted' && hasFollowUp ? 'active' : 'waiting',
    },
  ];
}

function getSalesOpsRecommendation({
  followUpDueCount,
  hotLeadCount,
  needsActionCount,
  packageRequestCount,
}: {
  followUpDueCount: number;
  hotLeadCount: number;
  needsActionCount: number;
  packageRequestCount: number;
}) {
  if (hotLeadCount > 0) {
    return {
      color: '#fb7185',
      detail: 'Send same-day reply, copy the sponsor reply draft, then schedule the next follow-up.',
      title: 'Start with hot sponsor package requests',
    };
  }

  if (followUpDueCount > 0) {
    return {
      color: '#f97316',
      detail: 'Handle overdue follow-ups before opening new low-intent leads.',
      title: 'Clear the follow-up queue',
    };
  }

  if (packageRequestCount > 0) {
    return {
      color: '#34d399',
      detail: 'Review package interest, budget signal and timeline before marking leads contacted.',
      title: 'Qualify package requests',
    };
  }

  if (needsActionCount > 0) {
    return {
      color: '#fbbf24',
      detail: 'Move pending or contacted leads into the next clear owner action.',
      title: 'Clean up open lead actions',
    };
  }

  return {
    color: '#93c5fd',
    detail: 'No urgent sponsor action is waiting in the current inbox.',
    title: 'Pipeline is clear',
  };
}

function buildSummary(leads: SponsorLeadInboxLead[]) {
  return leads.reduce<SponsorLeadInboxResponse['summary']>((summary, lead) => {
    const status = normalizeStatus(lead);
    const createdAt = typeof lead.created_at === 'string' ? lead.created_at : null;

    summary.total += 1;
    if (status === 'closed') {
      summary.closed += 1;
    } else if (status === 'contacted') {
      summary.contacted += 1;
      summary.needsAction += 1;
    } else if (status === 'rejected') {
      summary.rejected += 1;
    } else {
      summary.pending += 1;
      summary.needsAction += 1;
    }

    if (createdAt && (!summary.latestInboundAt || createdAt > summary.latestInboundAt)) {
      summary.latestInboundAt = createdAt;
    }

    return summary;
  }, {
    closed: 0,
    contacted: 0,
    latestInboundAt: null,
    needsAction: 0,
    pending: 0,
    rejected: 0,
    total: 0,
  });
}

function updateLeadInInbox(
  current: SponsorLeadInboxResponse | null,
  leadId: string,
  patch: Partial<SponsorLeadInboxLead>,
) {
  if (!current) {
    return current;
  }

  const leads = current.leads.map((lead) =>
    String(lead.id || '') === leadId ? { ...lead, ...patch } : lead,
  );

  return {
    ...current,
    leads,
    summary: buildSummary(leads),
  };
}

function formatRequestError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('CLIPBOARD_COPY_FAILED');
  }
}

function getAccessNotice(accessState: InboxAccessState) {
  if (accessState === 'signed-out') {
    return {
      accent: '#fbbf24',
      actionHref: buildReleaseLoginHref('/expo/sponsor-leads'),
      actionLabel: 'Sign in',
      body: 'Sponsor lead inbox is protected. Sign in with a sponsor or admin account to continue.',
      detail: 'If you are already signed in, refresh the page so the current Supabase session can be attached to the API request.',
      title: 'Sign in required',
    };
  }

  if (accessState === 'access-denied') {
    return {
      accent: '#fb7185',
      actionHref: '/expo-3d?salesDemo=1',
      actionLabel: 'Open sales demo',
      body: 'Your session is valid, but this account is not authorized for this sponsor lead inbox.',
      detail: 'Use the correct sponsor/admin account or ask an admin to grant access for this sponsor.',
      title: 'Access denied',
    };
  }

  if (accessState === 'backend-unavailable') {
    return {
      accent: '#38bdf8',
      actionHref: '/expo-3d?salesDemo=1',
      actionLabel: 'Open sales demo',
      body: 'The sponsor inbox is temporarily unavailable.',
      detail: 'Please try refreshing this page in a few minutes.',
      title: 'Backend unavailable',
    };
  }

  if (accessState === 'unavailable') {
    return {
      accent: '#f87171',
      actionHref: '/expo-3d?salesDemo=1',
      actionLabel: 'Open sales demo',
      body: 'The Sponsor Lead Inbox could not load.',
      detail: 'Please refresh this page or sign in again to try loading the inbox.',
      title: 'Inbox unavailable',
    };
  }

  return null;
}

export default function SponsorLeadInbox() {
  const {
    accessState,
    activeOpsSave,
    activeQuickAction,
    activeReplySentAction,
    activeStatusAction,
    data,
    leadFilter,
    loading,
    message,
    opsDrafts,
    setActiveOpsSave,
    setActiveQuickAction,
    setActiveReplySentAction,
    setActiveStatusAction,
    setData,
    setLeadFilter,
    setMessage,
    setOpsDrafts,
    sponsorSlug,
  } = useSponsorLeadInboxState();

  const sortedLeads = useMemo(() => {
    return [...(data?.leads ?? [])].sort((left, right) =>
      String(right.created_at || '').localeCompare(String(left.created_at || '')),
    );
  }, [data]);

  const packageRequestCount = useMemo(() => {
    return sortedLeads.filter((lead) => parseSponsorPackageLeadMessage(lead.message)).length;
  }, [sortedLeads]);

  const hotLeadCount = useMemo(() => {
    return sortedLeads.filter((lead) => getSponsorLeadQualificationForMessage(lead.message)?.priority === 'hot').length;
  }, [sortedLeads]);

  const followUpDueCount = useMemo(() => {
    const now = new Date();
    return sortedLeads.filter((lead) => getLeadFollowUpState(lead, now) === 'due').length;
  }, [sortedLeads]);

  const scheduledFollowUpCount = useMemo(() => {
    const now = new Date();
    return sortedLeads.filter((lead) => getLeadFollowUpState(lead, now) === 'scheduled').length;
  }, [sortedLeads]);

  const packageMix = useMemo(() => {
    const mix = PACKAGE_MIX_LABELS.reduce<Record<PackageMixKey, number>>((current, item) => {
      current[item.key] = 0;
      return current;
    }, {
      arena: 0,
      landmark: 0,
      other: 0,
      premium: 0,
      standard: 0,
    });

    sortedLeads.forEach((lead) => {
      const packageDetails = parseSponsorPackageLeadMessage(lead.message);
      if (!packageDetails) {
        return;
      }

      mix[getPackageMixKey(packageDetails.packageInterest)] += 1;
    });

    return mix;
  }, [sortedLeads]);

  const visibleLeads = useMemo(() => {
    if (leadFilter === 'hot-leads') {
      return sortedLeads.filter((lead) => getSponsorLeadQualificationForMessage(lead.message)?.priority === 'hot');
    }

    if (leadFilter === 'follow-up-due') {
      const now = new Date();
      return sortedLeads.filter((lead) => getLeadFollowUpState(lead, now) === 'due');
    }

    if (leadFilter === 'package-requests') {
      return sortedLeads.filter((lead) => parseSponsorPackageLeadMessage(lead.message));
    }

    if (leadFilter === 'needs-action') {
      return sortedLeads.filter((lead) => ['pending', 'contacted'].includes(normalizeStatus(lead)));
    }

    return sortedLeads;
  }, [leadFilter, sortedLeads]);

  useEffect(() => {
    setOpsDrafts((current) => {
      const next = { ...current };
      sortedLeads.forEach((lead) => {
        const key = String(lead.id || '');
        if (!key || next[key]) {
          return;
        }

        next[key] = {
          followUpAt: toDateTimeInputValue(lead.follow_up_at),
          opsNotes: String(lead.ops_notes || ''),
        };
      });

      return next;
    });
  }, [setOpsDrafts, sortedLeads]);

  async function handleStatusChange(leadId: string, status: SponsorLeadStatus) {
    if (!leadId) {
      return;
    }

    setActiveStatusAction(`${leadId}:${status}`);
    setMessage(null);

    try {
      await updateSponsorLeadInboxStatus(sponsorSlug, leadId, status);
      setData((current) => updateLeadInInbox(current, leadId, { status }));
      setMessage({ type: 'success', text: `Lead marked ${STATUS_LABELS[status].toLowerCase()}.` });
    } catch (updateError) {
      setMessage({ type: 'error', text: `Failed to update lead status: ${formatRequestError(updateError)}` });
    } finally {
      setActiveStatusAction(null);
    }
  }

  async function handleOpsSave(leadId: string) {
    if (!leadId) {
      return;
    }

    const draft = opsDrafts[leadId] ?? { followUpAt: '', opsNotes: '' };
    setActiveOpsSave(leadId);
    setMessage(null);

    try {
      const result = await updateSponsorLeadInboxOps(sponsorSlug, leadId, {
        followUpAt: draft.followUpAt ? new Date(draft.followUpAt).toISOString() : null,
        opsNotes: draft.opsNotes.trim() || null,
      });
      setData((current) =>
        updateLeadInInbox(current, leadId, {
          follow_up_at: result.follow_up_at,
          ops_notes: result.ops_notes,
          ops_updated_at: result.ops_updated_at,
        }),
      );
      setMessage({ type: 'success', text: 'Lead ops note saved.' });
    } catch (updateError) {
      setMessage({ type: 'error', text: `Failed to save lead ops note: ${formatRequestError(updateError)}` });
    } finally {
      setActiveOpsSave(null);
    }
  }

  async function handleContactedTomorrow(lead: SponsorLeadInboxLead) {
    const leadId = String(lead.id || '');
    if (!leadId) {
      return;
    }

    const draft = opsDrafts[leadId] ?? {
      followUpAt: toDateTimeInputValue(lead.follow_up_at),
      opsNotes: String(lead.ops_notes || ''),
    };
    const followUpAt = getTomorrowMorningFollowUpIso();

    setActiveQuickAction(leadId);
    setMessage(null);

    try {
      await updateSponsorLeadInboxStatus(sponsorSlug, leadId, 'contacted');
      setData((current) => updateLeadInInbox(current, leadId, { status: 'contacted' }));

      const result = await updateSponsorLeadInboxOps(sponsorSlug, leadId, {
        followUpAt,
        opsNotes: draft.opsNotes.trim() || null,
      });

      setData((current) =>
        updateLeadInInbox(current, leadId, {
          follow_up_at: result.follow_up_at,
          ops_notes: result.ops_notes,
          ops_updated_at: result.ops_updated_at,
          status: 'contacted',
        }),
      );
      setOpsDrafts((current) => ({
        ...current,
        [leadId]: {
          followUpAt: toDateTimeInputValue(result.follow_up_at),
          opsNotes: String(result.ops_notes || ''),
        },
      }));
      setMessage({ type: 'success', text: 'Lead marked contacted and follow-up set for tomorrow.' });
    } catch (quickActionError) {
      setMessage({ type: 'error', text: `Failed to schedule quick follow-up: ${formatRequestError(quickActionError)}` });
    } finally {
      setActiveQuickAction(null);
    }
  }

  async function handleReplySentTomorrow(lead: SponsorLeadInboxLead) {
    const leadId = String(lead.id || '');
    if (!leadId) {
      return;
    }

    const draft = opsDrafts[leadId] ?? {
      followUpAt: toDateTimeInputValue(lead.follow_up_at),
      opsNotes: String(lead.ops_notes || ''),
    };
    const followUpAt = getTomorrowMorningFollowUpIso();
    const opsNotes = appendSponsorLeadOpsNote(draft.opsNotes || lead.ops_notes, buildSponsorLeadReplySentNote(lead));

    setActiveReplySentAction(leadId);
    setMessage(null);

    try {
      await updateSponsorLeadInboxStatus(sponsorSlug, leadId, 'contacted');
      setData((current) => updateLeadInInbox(current, leadId, { status: 'contacted' }));

      const result = await updateSponsorLeadInboxOps(sponsorSlug, leadId, {
        followUpAt,
        opsNotes,
      });

      setData((current) =>
        updateLeadInInbox(current, leadId, {
          follow_up_at: result.follow_up_at,
          ops_notes: result.ops_notes,
          ops_updated_at: result.ops_updated_at,
          status: 'contacted',
        }),
      );
      setOpsDrafts((current) => ({
        ...current,
        [leadId]: {
          followUpAt: toDateTimeInputValue(result.follow_up_at),
          opsNotes: String(result.ops_notes || ''),
        },
      }));
      setMessage({ type: 'success', text: 'Reply marked sent and follow-up set for tomorrow.' });
    } catch (replySentError) {
      setMessage({ type: 'error', text: `Failed to mark reply sent: ${formatRequestError(replySentError)}` });
    } finally {
      setActiveReplySentAction(null);
    }
  }

  const summaryCards = [
    { label: 'Total leads', value: data?.summary.total ?? 0, color: '#f8fafc' },
    { label: 'Hot leads', value: hotLeadCount, color: '#fb7185' },
    { label: 'Follow-up due', value: followUpDueCount, color: '#f97316' },
    { label: 'Needs action', value: data?.summary.needsAction ?? 0, color: '#fbbf24' },
    { label: 'Package requests', value: packageRequestCount, color: '#34d399' },
    { label: 'Contacted', value: data?.summary.contacted ?? 0, color: '#93c5fd' },
    { label: 'Closed', value: data?.summary.closed ?? 0, color: '#34d399' },
  ];
  const leadFilters: Array<{ count: number; label: string; value: LeadFilter }> = [
    { count: sortedLeads.length, label: 'All leads', value: 'all' },
    { count: hotLeadCount, label: 'Hot leads', value: 'hot-leads' },
    { count: followUpDueCount, label: 'Follow-up due', value: 'follow-up-due' },
    { count: data?.summary.needsAction ?? 0, label: 'Needs action', value: 'needs-action' },
    { count: packageRequestCount, label: 'Package requests', value: 'package-requests' },
  ];
  const triageRows: Array<{ color: string; count: number; description: string; filter: LeadFilter; label: string }> = [
    {
      color: '#fb7185',
      count: hotLeadCount,
      description: 'Landmark, Arena or high-intent Premium requests should get same-day reply.',
      filter: 'hot-leads',
      label: 'Reply today',
    },
    {
      color: '#f97316',
      count: followUpDueCount,
      description: 'Scheduled follow-ups that are due or overdue and not closed/rejected.',
      filter: 'follow-up-due',
      label: 'Follow-up due',
    },
    {
      color: '#fbbf24',
      count: data?.summary.needsAction ?? 0,
      description: 'Pending or contacted leads that still need owner action.',
      filter: 'needs-action',
      label: 'Needs action',
    },
    {
      color: '#34d399',
      count: packageRequestCount,
      description: 'Structured sponsor package requests with budget, timeline and package context.',
      filter: 'package-requests',
      label: 'Package requests',
    },
  ];
  const salesOpsRecommendation = getSalesOpsRecommendation({
    followUpDueCount,
    hotLeadCount,
    needsActionCount: data?.summary.needsAction ?? 0,
    packageRequestCount,
  });
  const salesOpsWorkflow = [
    'Reply to hot Landmark, Arena or Premium leads first.',
    'Use the reply draft, then mark reply sent and set tomorrow follow-up.',
    'Confirm package interest, budget signal and timeline before exporting CSV.',
    'Move contacted leads to closed or rejected when the commercial outcome is clear.',
  ];
  const accessNotice = getAccessNotice(accessState);
  const shouldShowInboxContent = loading || accessState === 'ready' || Boolean(data);

  function handleCsvExport() {
    if (visibleLeads.length === 0) {
      setMessage({ type: 'error', text: 'No visible leads to export.' });
      return;
    }

    const csv = serializeSponsorLeadCsv(visibleLeads);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `expo-sponsor-leads-${sponsorSlug}-${leadFilter}-${date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setMessage({ type: 'success', text: `Exported ${visibleLeads.length} sponsor lead${visibleLeads.length === 1 ? '' : 's'} to CSV.` });
  }

  async function handleCopyLeadSummary(lead: SponsorLeadInboxLead) {
    try {
      await copyTextToClipboard(buildSponsorLeadCopySummary(lead));
      setMessage({ type: 'success', text: 'Lead summary copied.' });
    } catch (copyError) {
      setMessage({ type: 'error', text: `Could not copy lead summary: ${formatRequestError(copyError)}` });
    }
  }

  async function handleCopyReplyDraft(lead: SponsorLeadInboxLead) {
    const draft = buildSponsorLeadReplyDraft(lead);

    try {
      await copyTextToClipboard(`Subject: ${draft.subject}\n\n${draft.body}`);
      setMessage({ type: 'success', text: 'Sponsor reply draft copied.' });
    } catch (copyError) {
      setMessage({ type: 'error', text: `Could not copy reply draft: ${formatRequestError(copyError)}` });
    }
  }

  return (
    <div className="calculator-pro-wrapper" style={{ maxWidth: '1180px', margin: '0 auto', padding: '40px 20px', color: 'white' }}>
      <SponsorLeadInboxPageHeader />
      <SponsorLeadInboxHero
        displayName={data?.sponsor.displayName || 'Sponsor Concierge'}
        latestInbound={formatDate(data?.summary.latestInboundAt)}
        sponsorSlug={data?.sponsor.slug || sponsorSlug}
      />
      <SponsorLeadInboxAccessNotice notice={accessNotice} />
      <SponsorLeadInboxMessage message={message} />

      {shouldShowInboxContent && (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            {summaryCards.map((entry) => (
              <div key={entry.label} className="glass-card" style={{ padding: '18px', borderRadius: '20px' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{entry.label}</div>
                <div style={{ color: entry.color, fontSize: '2rem', fontWeight: 950, marginTop: '6px' }}>{loading ? '-' : entry.value}</div>
              </div>
            ))}
          </section>

          <section className="glass-card" style={{ borderRadius: '24px', marginBottom: '24px', padding: '22px' }}>
            <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '18px', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <div style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Sales ops snapshot
                </div>
                <h2 style={{ fontSize: '1.35rem', letterSpacing: '-0.03em', margin: '6px 0 0' }}>
                  Package pipeline and next action
                </h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <a
                  href="/expo/sponsor-packages"
                  style={{
                    background: 'rgba(15, 23, 42, 0.78)',
                    border: '1px solid rgba(148, 163, 184, 0.24)',
                    borderRadius: '999px',
                    color: '#cbd5e1',
                    fontSize: '0.72rem',
                    fontWeight: 900,
                    letterSpacing: '0.06em',
                    padding: '9px 12px',
                    textDecoration: 'none',
                    textTransform: 'uppercase',
                  }}
                >
                  Sponsor packages
                </a>
                <a
                  href="/expo-3d?salesDemo=1"
                  style={{
                    background: 'rgba(14, 116, 144, 0.24)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: '999px',
                    color: '#bae6fd',
                    fontSize: '0.72rem',
                    fontWeight: 900,
                    letterSpacing: '0.06em',
                    padding: '9px 12px',
                    textDecoration: 'none',
                    textTransform: 'uppercase',
                  }}
                >
                  Sales demo
                </a>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div
                style={{
                  background: `linear-gradient(135deg, ${salesOpsRecommendation.color}24, rgba(8, 47, 73, 0.34))`,
                  border: `1px solid ${salesOpsRecommendation.color}55`,
                  borderRadius: '18px',
                  padding: '18px',
                }}
              >
                <div style={{ color: salesOpsRecommendation.color, fontSize: '0.72rem', fontWeight: 950, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Recommended next move
                </div>
                <h3 style={{ color: '#f8fafc', fontSize: '1.08rem', margin: '8px 0 8px' }}>
                  {loading ? 'Loading sponsor pipeline' : salesOpsRecommendation.title}
                </h3>
                <p style={{ color: '#cbd5e1', lineHeight: 1.55, margin: 0 }}>
                  {loading ? 'Fetching lead data and qualification signals.' : salesOpsRecommendation.detail}
                </p>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginTop: '16px' }}>
                  {[
                    { color: '#fb7185', label: 'Hot leads', value: hotLeadCount },
                    { color: '#f97316', label: 'Due now', value: followUpDueCount },
                    { color: '#fbbf24', label: 'Needs action', value: data?.summary.needsAction ?? 0 },
                  ].map((item) => (
                    <div key={item.label} style={{ background: 'rgba(2, 6, 23, 0.42)', borderRadius: '14px', padding: '12px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{item.label}</div>
                      <div style={{ color: item.color, fontSize: '1.5rem', fontWeight: 950, marginTop: '4px' }}>{loading ? '-' : item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.68)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '18px', padding: '18px' }}>
                <div style={{ color: '#93c5fd', fontSize: '0.72rem', fontWeight: 950, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Package mix
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                  {PACKAGE_MIX_LABELS.map((item) => (
                    <span
                      key={item.key}
                      style={{
                        background: `${item.color}1f`,
                        border: `1px solid ${item.color}55`,
                        borderRadius: '999px',
                        color: item.color,
                        fontSize: '0.72rem',
                        fontWeight: 950,
                        letterSpacing: '0.04em',
                        padding: '8px 10px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {item.label}: {loading ? '-' : packageMix[item.key]}
                    </span>
                  ))}
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '0.82rem', fontWeight: 850, marginTop: '16px' }}>
                  Daily workflow
                </div>
                <ol style={{ color: '#94a3b8', lineHeight: 1.5, margin: '8px 0 0', paddingLeft: '20px' }}>
                  {salesOpsWorkflow.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section className="glass-card" style={{ borderRadius: '24px', marginBottom: '24px', padding: '22px' }}>
            <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ color: '#38bdf8', fontSize: '0.72rem', fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Sponsor ops triage
                </div>
                <h2 style={{ fontSize: '1.35rem', letterSpacing: '-0.03em', margin: '6px 0 0' }}>
                  What should be handled first
                </h2>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 850 }}>
                Scheduled follow-ups: {loading ? '-' : scheduledFollowUpCount}
              </span>
            </div>
            <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
              {triageRows.map((row) => (
                <button
                  key={row.label}
                  type="button"
                  onClick={() => setLeadFilter(row.filter)}
                  style={{
                    background: leadFilter === row.filter ? `${row.color}24` : 'rgba(15, 23, 42, 0.72)',
                    border: `1px solid ${leadFilter === row.filter ? row.color : 'rgba(148, 163, 184, 0.18)'}`,
                    borderRadius: '18px',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    padding: '16px',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ alignItems: 'center', display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
                    <span style={{ color: row.color, fontSize: '0.74rem', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {row.label}
                    </span>
                    <strong style={{ color: row.color, fontSize: '1.45rem' }}>{loading ? '-' : row.count}</strong>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '0.84rem', lineHeight: 1.45, margin: '8px 0 0' }}>
                    {row.description}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="glass-card" style={{ padding: '24px', borderRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'baseline', marginBottom: '18px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Inbound Sponsor Leads</h2>
              <div style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {loading ? 'Loading' : `${visibleLeads.length} shown / ${sortedLeads.length} loaded`}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
              {leadFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={leadFilter === filter.value}
                  onClick={() => setLeadFilter(filter.value)}
                  style={{
                    background: leadFilter === filter.value ? 'rgba(56, 189, 248, 0.22)' : 'rgba(15, 23, 42, 0.78)',
                    border: `1px solid ${leadFilter === filter.value ? 'rgba(56, 189, 248, 0.68)' : 'rgba(148, 163, 184, 0.22)'}`,
                    borderRadius: '999px',
                    color: leadFilter === filter.value ? '#e0f2fe' : '#cbd5e1',
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 900,
                    letterSpacing: '0.05em',
                    padding: '9px 12px',
                    textTransform: 'uppercase',
                  }}
                >
                  {filter.label} - {filter.count}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
              <button
                type="button"
                disabled={loading || visibleLeads.length === 0}
                onClick={handleCsvExport}
                style={{
                  background: 'rgba(20, 83, 45, 0.64)',
                  border: '1px solid rgba(52, 211, 153, 0.58)',
                  borderRadius: '999px',
                  color: '#bbf7d0',
                  cursor: loading || visibleLeads.length === 0 ? 'default' : 'pointer',
                  fontSize: '0.74rem',
                  fontWeight: 950,
                  letterSpacing: '0.06em',
                  opacity: loading || visibleLeads.length === 0 ? 0.58 : 1,
                  padding: '9px 13px',
                  textTransform: 'uppercase',
                }}
              >
                Export CSV
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '32px', color: '#94a3b8', textAlign: 'center' }}>Loading sponsor leads...</div>
            ) : visibleLeads.length === 0 ? (
              <div style={{ padding: '32px', color: '#94a3b8', textAlign: 'center' }}>No sponsor leads match this filter.</div>
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>
                {visibleLeads.map((lead) => {
                  const status = normalizeStatus(lead);
                  const leadId = String(lead.id || '');
                  const draft = opsDrafts[leadId] ?? { followUpAt: '', opsNotes: '' };
                  const packageDetails = parseSponsorPackageLeadMessage(lead.message);
                  const packageQualification = packageDetails ? getSponsorPackageLeadQualification(packageDetails) : null;
                  const replyDraft = buildSponsorLeadReplyDraft(lead);
                  const latestReplySentAt = getLatestSponsorLeadReplySentAt(lead);
                  const followUpState = getLeadFollowUpState(lead);
                  const packageAccent = getPackageTierColor(packageDetails?.packageInterest);
                  const actionAccent = followUpState === 'due'
                    ? '#f97316'
                    : packageQualification
                      ? LEAD_PRIORITY_COLORS[packageQualification.priority]
                      : '#94a3b8';
                  const commercialNextAction = packageQualification?.nextAction
                    ?? (followUpState === 'due'
                      ? 'Complete the scheduled follow-up now.'
                      : 'Review message and qualify sponsor intent.');
                  const isLeadClosed = status === 'closed' || status === 'rejected';
                  const replyPreviewLines = getReplyPreviewLines(replyDraft);
                  const workflowSteps = buildLeadWorkflowSteps({
                    followUpState,
                    hasPackageDetails: Boolean(packageDetails),
                    latestReplySentAt,
                    status,
                  });
                  return (
                    <article
                      key={leadId || `${lead.client_email}:${lead.created_at}`}
                      data-sponsor-lead-card="true"
                      data-sponsor-lead-email={lead.client_email || ''}
                      data-sponsor-lead-id={leadId}
                      style={{ padding: '18px', borderRadius: '18px', background: 'rgba(2, 6, 23, 0.72)', border: '1px solid rgba(148, 163, 184, 0.18)' }}
                    >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#f8fafc' }}>{lead.client_name || 'Unnamed lead'}</h3>
                      <div style={{ color: '#93c5fd', fontSize: '0.9rem', marginTop: '4px' }}>{lead.client_email || 'No email provided'}</div>
                    </div>
                    <div style={{ alignItems: 'flex-end', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ padding: '6px 10px', borderRadius: '999px', color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}66`, background: `${STATUS_COLORS[status]}1f`, fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {status}
                      </span>
                      {followUpState !== 'none' && (
                        <button
                          type="button"
                          onClick={() => setLeadFilter(followUpState === 'due' ? 'follow-up-due' : 'needs-action')}
                          style={{
                            background: followUpState === 'due' ? 'rgba(249, 115, 22, 0.18)' : 'rgba(59, 130, 246, 0.14)',
                            border: `1px solid ${followUpState === 'due' ? 'rgba(249, 115, 22, 0.62)' : 'rgba(147, 197, 253, 0.42)'}`,
                            borderRadius: '999px',
                            color: followUpState === 'due' ? '#fdba74' : '#bfdbfe',
                            cursor: 'pointer',
                            fontSize: '0.68rem',
                            fontWeight: 950,
                            letterSpacing: '0.06em',
                            padding: '7px 10px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {followUpState === 'due' ? 'Follow-up due' : 'Follow-up scheduled'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCopyLeadSummary(lead)}
                        style={{
                          background: 'rgba(15, 23, 42, 0.82)',
                          border: '1px solid rgba(148, 163, 184, 0.24)',
                          borderRadius: '999px',
                          color: '#cbd5e1',
                          cursor: 'pointer',
                          fontSize: '0.68rem',
                          fontWeight: 900,
                          letterSpacing: '0.06em',
                          padding: '7px 10px',
                          textTransform: 'uppercase',
                        }}
                      >
                        Copy summary
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyReplyDraft(lead)}
                        style={{
                          background: 'rgba(14, 116, 144, 0.24)',
                          border: '1px solid rgba(56, 189, 248, 0.38)',
                          borderRadius: '999px',
                          color: '#bae6fd',
                          cursor: 'pointer',
                          fontSize: '0.68rem',
                          fontWeight: 900,
                          letterSpacing: '0.06em',
                          padding: '7px 10px',
                          textTransform: 'uppercase',
                        }}
                      >
                        Copy reply
                      </button>
                      {replyDraft.hasRecipient ? (
                        <a
                          href={replyDraft.mailtoHref}
                          style={{
                            background: 'rgba(20, 83, 45, 0.36)',
                            border: '1px solid rgba(52, 211, 153, 0.38)',
                            borderRadius: '999px',
                            color: '#bbf7d0',
                            fontSize: '0.68rem',
                            fontWeight: 900,
                            letterSpacing: '0.06em',
                            padding: '7px 10px',
                            textDecoration: 'none',
                            textTransform: 'uppercase',
                          }}
                        >
                          Email draft
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div
                    data-sponsor-lead-next-action="true"
                    style={{
                      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.7))',
                      border: `1px solid ${actionAccent}55`,
                      borderRadius: '17px',
                      display: 'grid',
                      gap: '12px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      marginTop: '14px',
                      padding: '14px',
                    }}
                  >
                    <div>
                      <div style={{ color: actionAccent, fontSize: '0.68rem', fontWeight: 950, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Commercial next step
                      </div>
                      <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 900, lineHeight: 1.35, marginTop: '6px' }}>
                        {commercialNextAction}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.45, marginTop: '7px' }}>
                        {packageDetails
                          ? `${packageDetails.company || 'Unknown company'} - ${packageDetails.budgetSignal || 'budget unknown'} - ${packageDetails.timeline || 'timeline unknown'}`
                          : lead.service_name || 'General expo lead'}
                      </div>
                    </div>
                    <div style={{ alignContent: 'start', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-start' }}>
                      <span
                        data-sponsor-lead-package-badge="true"
                        style={{
                          background: `${packageAccent}1c`,
                          border: `1px solid ${packageAccent}55`,
                          borderRadius: '999px',
                          color: packageAccent,
                          fontSize: '0.68rem',
                          fontWeight: 950,
                          letterSpacing: '0.07em',
                          padding: '7px 10px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {packageDetails?.packageInterest || 'General inquiry'}
                      </span>
                      <span
                        style={{
                          background: `${actionAccent}1f`,
                          border: `1px solid ${actionAccent}66`,
                          borderRadius: '999px',
                          color: actionAccent,
                          fontSize: '0.68rem',
                          fontWeight: 950,
                          letterSpacing: '0.07em',
                          padding: '7px 10px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {packageQualification?.priorityLabel || (followUpState === 'due' ? 'Follow-up due' : 'Qualify')}
                      </span>
                      <span style={{ background: `${STATUS_COLORS[status]}1f`, border: `1px solid ${STATUS_COLORS[status]}66`, borderRadius: '999px', color: STATUS_COLORS[status], fontSize: '0.68rem', fontWeight: 950, letterSpacing: '0.07em', padding: '7px 10px', textTransform: 'uppercase' }}>
                        {STATUS_LABELS[status as SponsorLeadStatus] ?? status}
                      </span>
                    </div>
                  </div>
                  <div
                    data-sponsor-lead-workflow="true"
                    style={{
                      background: 'rgba(15, 23, 42, 0.58)',
                      border: '1px solid rgba(148, 163, 184, 0.16)',
                      borderRadius: '17px',
                      display: 'grid',
                      gap: '10px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      marginTop: '14px',
                      padding: '14px',
                    }}
                  >
                    {workflowSteps.map((step, index) => {
                      const color = WORKFLOW_STEP_COLORS[step.state];
                      return (
                        <div
                          key={step.label}
                          data-sponsor-lead-workflow-step={step.label.toLowerCase()}
                          data-sponsor-lead-workflow-state={step.state}
                          style={{
                            background: step.state === 'waiting' ? 'rgba(2, 6, 23, 0.28)' : `${color}14`,
                            border: `1px solid ${color}44`,
                            borderRadius: '14px',
                            minHeight: '104px',
                            padding: '12px',
                          }}
                        >
                          <div style={{ alignItems: 'center', display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                            <span style={{ color, fontSize: '0.67rem', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              {index + 1}. {step.label}
                            </span>
                            <span style={{ color, fontSize: '0.62rem', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              {step.state}
                            </span>
                          </div>
                          <p style={{ color: step.state === 'waiting' ? '#64748b' : '#cbd5e1', fontSize: '0.78rem', lineHeight: 1.45, margin: '9px 0 0' }}>
                            {step.detail}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    data-sponsor-lead-reply-toolkit="true"
                    style={{
                      background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.48), rgba(15, 23, 42, 0.66))',
                      border: '1px solid rgba(56, 189, 248, 0.24)',
                      borderRadius: '17px',
                      display: 'grid',
                      gap: '14px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      marginTop: '14px',
                      padding: '14px',
                    }}
                  >
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: '0.68rem', fontWeight: 950, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Reply toolkit
                      </div>
                      <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: 900, marginTop: '7px' }}>
                        {replyDraft.subject}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.45, marginTop: '8px' }}>
                        {replyPreviewLines.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </div>
                    </div>
                    <div style={{ alignContent: 'start', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-start' }}>
                      <button
                        type="button"
                        onClick={() => void handleCopyReplyDraft(lead)}
                        style={{
                          background: 'rgba(14, 116, 144, 0.34)',
                          border: '1px solid rgba(56, 189, 248, 0.52)',
                          borderRadius: '999px',
                          color: '#bae6fd',
                          cursor: 'pointer',
                          fontSize: '0.68rem',
                          fontWeight: 950,
                          letterSpacing: '0.06em',
                          padding: '8px 11px',
                          textTransform: 'uppercase',
                        }}
                      >
                        Copy reply
                      </button>
                      {replyDraft.hasRecipient ? (
                        <a
                          href={replyDraft.mailtoHref}
                          style={{
                            background: 'rgba(20, 83, 45, 0.42)',
                            border: '1px solid rgba(52, 211, 153, 0.5)',
                            borderRadius: '999px',
                            color: '#bbf7d0',
                            fontSize: '0.68rem',
                            fontWeight: 950,
                            letterSpacing: '0.06em',
                            padding: '8px 11px',
                            textDecoration: 'none',
                            textTransform: 'uppercase',
                          }}
                        >
                          Email draft
                        </a>
                      ) : null}
                      <button
                        type="button"
                        disabled={!leadId || activeReplySentAction === leadId || isLeadClosed}
                        onClick={() => void handleReplySentTomorrow(lead)}
                        style={{
                          background: 'rgba(79, 70, 229, 0.3)',
                          border: '1px solid rgba(129, 140, 248, 0.48)',
                          borderRadius: '999px',
                          color: '#c7d2fe',
                          cursor: !leadId || isLeadClosed ? 'default' : 'pointer',
                          fontSize: '0.68rem',
                          fontWeight: 950,
                          letterSpacing: '0.06em',
                          opacity: !leadId || activeReplySentAction === leadId || isLeadClosed ? 0.58 : 1,
                          padding: '8px 11px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {activeReplySentAction === leadId ? 'Marking...' : 'Reply sent + follow-up'}
                      </button>
                    </div>
                  </div>
                  {packageDetails ? (
                    <div
                      style={{
                        background: 'linear-gradient(135deg, rgba(20, 83, 45, 0.44), rgba(8, 47, 73, 0.4))',
                        border: '1px solid rgba(52, 211, 153, 0.28)',
                        borderRadius: '16px',
                        marginTop: '14px',
                        padding: '14px',
                      }}
                    >
                      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between' }}>
                        <div style={{ color: '#bbf7d0', fontSize: '0.72rem', fontWeight: 950, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          Sponsor package request
                        </div>
                        <span style={{ background: 'rgba(52, 211, 153, 0.14)', border: '1px solid rgba(52, 211, 153, 0.44)', borderRadius: '999px', color: '#bbf7d0', fontSize: '0.7rem', fontWeight: 950, padding: '6px 10px', textTransform: 'uppercase' }}>
                          {packageDetails.packageInterest}
                        </span>
                      </div>
                      {packageQualification && (
                        <div
                          style={{
                            background: 'rgba(2, 6, 23, 0.38)',
                            border: '1px solid rgba(148, 163, 184, 0.16)',
                            borderRadius: '14px',
                            marginTop: '12px',
                            padding: '12px',
                          }}
                        >
                          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span
                              style={{
                                background: `${LEAD_PRIORITY_COLORS[packageQualification.priority]}24`,
                                border: `1px solid ${LEAD_PRIORITY_COLORS[packageQualification.priority]}66`,
                                borderRadius: '999px',
                                color: LEAD_PRIORITY_COLORS[packageQualification.priority],
                                fontSize: '0.68rem',
                                fontWeight: 950,
                                letterSpacing: '0.08em',
                                padding: '6px 10px',
                                textTransform: 'uppercase',
                              }}
                            >
                              {packageQualification.priorityLabel}
                            </span>
                            <span style={{ color: '#cbd5e1', fontSize: '0.78rem', fontWeight: 800 }}>
                              {packageQualification.reason}
                            </span>
                          </div>
                          <div style={{ color: '#e0f2fe', fontSize: '0.86rem', fontWeight: 850, marginTop: '8px' }}>
                            Next action: {packageQualification.nextAction}
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '12px' }}>
                        {[
                          ['Company', packageDetails.company],
                          ['Phone', packageDetails.phone],
                          ['Website', packageDetails.website],
                          ['Budget', packageDetails.budgetSignal],
                          ['Timeline', packageDetails.timeline],
                        ].map(([label, value]) => (
                          <div key={label} style={{ background: 'rgba(2, 6, 23, 0.46)', borderRadius: '12px', padding: '10px' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
                            <div style={{ color: '#f8fafc', fontSize: '0.9rem', fontWeight: 850, marginTop: '4px', overflowWrap: 'anywhere' }}>{value || 'Not provided'}</div>
                          </div>
                        ))}
                      </div>
                      <p style={{ color: '#e2e8f0', lineHeight: 1.55, margin: '12px 0 0' }}>{packageDetails.message}</p>
                    </div>
                  ) : (
                    <p style={{ color: '#cbd5e1', lineHeight: 1.55, margin: '14px 0 0' }}>{lead.message || 'No message provided.'}</p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '14px', color: '#64748b', fontSize: '0.76rem', flexWrap: 'wrap' }}>
                    <span>{lead.service_name || 'expo_sponsor_lead'}</span>
                    <span>{formatDate(lead.created_at)}</span>
                  </div>
                  {(lead.ops_notes || lead.follow_up_at) && (
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(148, 163, 184, 0.16)', color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.5 }}>
                      {latestReplySentAt && <div>Last reply: {formatDate(latestReplySentAt)}</div>}
                      {lead.follow_up_at && <div>Follow-up: {formatDate(lead.follow_up_at)}</div>}
                      {lead.ops_notes && <div>Ops note: {lead.ops_notes}</div>}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
                    <button
                      type="button"
                      disabled={!leadId || activeQuickAction === leadId || status === 'closed' || status === 'rejected'}
                      onClick={() => void handleContactedTomorrow(lead)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '999px',
                        border: '1px solid rgba(56, 189, 248, 0.72)',
                        background: 'rgba(14, 116, 144, 0.28)',
                        color: '#bae6fd',
                        cursor: !leadId || status === 'closed' || status === 'rejected' ? 'default' : 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: 950,
                        letterSpacing: '0.04em',
                        opacity: !leadId || activeQuickAction === leadId || status === 'closed' || status === 'rejected' ? 0.58 : 1,
                        textTransform: 'uppercase',
                      }}
                    >
                      {activeQuickAction === leadId ? 'Scheduling...' : 'Contacted + tomorrow'}
                    </button>
                    {replyDraft.hasRecipient ? (
                      <button
                        type="button"
                        disabled={!leadId || activeReplySentAction === leadId || status === 'closed' || status === 'rejected'}
                        onClick={() => void handleReplySentTomorrow(lead)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '999px',
                          border: '1px solid rgba(52, 211, 153, 0.68)',
                          background: 'rgba(20, 83, 45, 0.34)',
                          color: '#bbf7d0',
                          cursor: !leadId || status === 'closed' || status === 'rejected' ? 'default' : 'pointer',
                          fontSize: '0.72rem',
                          fontWeight: 950,
                          letterSpacing: '0.04em',
                          opacity: !leadId || activeReplySentAction === leadId || status === 'closed' || status === 'rejected' ? 0.58 : 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        {activeReplySentAction === leadId ? 'Marking...' : 'Reply sent + tomorrow'}
                      </button>
                    ) : null}
                    {(['pending', 'contacted', 'closed', 'rejected'] as SponsorLeadStatus[]).map((nextStatus) => (
                      <button
                        key={nextStatus}
                        type="button"
                        disabled={!leadId || activeStatusAction === `${leadId}:${nextStatus}` || status === nextStatus}
                        onClick={() => void handleStatusChange(leadId, nextStatus)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '999px',
                          border: `1px solid ${STATUS_COLORS[nextStatus]}66`,
                          background: status === nextStatus ? `${STATUS_COLORS[nextStatus]}26` : 'rgba(15, 23, 42, 0.88)',
                          color: STATUS_COLORS[nextStatus],
                          cursor: !leadId || status === nextStatus ? 'default' : 'pointer',
                          fontSize: '0.72rem',
                          fontWeight: 900,
                          letterSpacing: '0.04em',
                          opacity: !leadId || activeStatusAction === `${leadId}:${nextStatus}` ? 0.58 : 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        {activeStatusAction === `${leadId}:${nextStatus}` ? 'Saving...' : STATUS_LABELS[nextStatus]}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(148, 163, 184, 0.16)' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.08em', marginBottom: '10px', textTransform: 'uppercase' }}>
                      Follow-up ops
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.42fr) 1fr auto', gap: '10px', alignItems: 'end' }}>
                      <label style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                        Follow-up at
                        <input
                          type="datetime-local"
                          value={draft.followUpAt}
                          onChange={(event) =>
                            setOpsDrafts((current) => ({
                              ...current,
                              [leadId]: {
                                followUpAt: event.target.value,
                                opsNotes: current[leadId]?.opsNotes ?? draft.opsNotes,
                              },
                            }))
                          }
                          style={{ marginTop: '8px' }}
                        />
                      </label>
                      <label style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                        Ops note
                        <input
                          type="text"
                          value={draft.opsNotes}
                          onChange={(event) =>
                            setOpsDrafts((current) => ({
                              ...current,
                              [leadId]: {
                                followUpAt: current[leadId]?.followUpAt ?? draft.followUpAt,
                                opsNotes: event.target.value,
                              },
                            }))
                          }
                          placeholder="Next action, objection, or sponsor follow-up context"
                          style={{ marginTop: '8px' }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!leadId || activeOpsSave === leadId}
                        onClick={() => void handleOpsSave(leadId)}
                        style={{
                          padding: '11px 14px',
                          borderRadius: '999px',
                          border: '1px solid rgba(56, 189, 248, 0.65)',
                          background: 'rgba(8, 47, 73, 0.72)',
                          color: '#e0f2fe',
                          cursor: leadId ? 'pointer' : 'default',
                          fontSize: '0.72rem',
                          fontWeight: 900,
                          letterSpacing: '0.06em',
                          opacity: !leadId || activeOpsSave === leadId ? 0.6 : 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        {activeOpsSave === leadId ? 'Saving...' : 'Save Ops'}
                      </button>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '8px' }}>
                      Last ops update: {formatDate(lead.ops_updated_at)}
                    </div>
                  </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

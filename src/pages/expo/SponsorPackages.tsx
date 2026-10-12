import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  INITIAL_SPONSOR_PACKAGE_REQUEST_FORM,
  getSponsorPackageInterestLabel,
  getSponsorPackageRequestFailure,
  getPendingSponsorPackageRequestQueue,
  readSponsorPackageRequestQueue,
  saveSponsorPackageRequest,
  submitSponsorPackageRequestToBackend,
  syncPendingSponsorPackageRequests,
  validateSponsorPackageRequestForm,
  type SponsorPackageInterest,
  type SponsorPackageRequestForm,
} from '../../app/expo/sponsorPackageRequest';
import '../../components/calculator/styles/CalculatorPro.css';
import WarpalaLogo from '../../shared/Logo';

type PackageCard = {
  accent: string;
  audience: string;
  bestFor: string;
  cta: string;
  demoHref: string;
  description: string;
  deliverables: string[];
  features: string[];
  id: Exclude<SponsorPackageInterest, 'arena' | 'unsure'>;
  label: string;
  outcome: string;
  priceRange: string;
  priceSignal: string;
  proof: string;
  salesMetric: string;
  title: string;
};

const SPONSOR_PACKAGES: PackageCard[] = [
  {
    accent: '#38bdf8',
    audience: 'Best for a team that wants a polished Web3D presence without a large campaign buildout.',
    bestFor: 'First sponsor booth, product showcase, or event presence.',
    cta: 'Choose Standard',
    demoHref: '/expo-3d?salesDemo=1&salesDemoStep=standard',
    description: 'A visible sponsor booth with a clear offer, brand media, and a simple request path.',
    deliverables: ['Sponsor booth', 'Product headline', 'Demo screen content', 'Lead request path'],
    features: ['Brand profile and short offer', 'Demo-ready booth screen', 'Sponsor request form'],
    id: 'standard',
    label: 'Standard Booth',
    outcome: 'Launch a booth quickly and start collecting interest from expo visitors.',
    priceRange: 'From EUR 1.5k-3k / campaign',
    priceSignal: 'Entry package',
    proof: 'Preview a standard sponsor booth in the guided sales demo.',
    salesMetric: 'Booth visits, screen views, and request submissions',
    title: 'Standard Booth',
  },
  {
    accent: '#fbbf24',
    audience: 'Best for sponsors that care about qualified conversations, meetings, and follow-up.',
    bestFor: 'B2B sponsors, product launches, and partner teams that need more than visibility.',
    cta: 'Choose Premium',
    demoHref: '/expo-3d?salesDemo=1&salesDemoStep=premium',
    description: 'A stronger sponsor booth with contact actions, screen ownership, and lead follow-up support.',
    deliverables: ['Premium booth', 'Meeting CTA', 'Sponsor screen placement', 'Lead report package'],
    features: ['Meeting-ready sponsor profile', 'Premium booth media surface', 'Lead follow-up package'],
    id: 'premium',
    label: 'Premium Booth',
    outcome: 'Turn expo attention into concrete meetings and qualified sponsor requests.',
    priceRange: 'From EUR 5k-15k / campaign',
    priceSignal: 'Lead-gen package',
    proof: 'Preview a premium booth and sponsor screen in the guided sales demo.',
    salesMetric: 'Booked meetings, qualified requests, and follow-up status',
    title: 'Premium Booth',
  },
  {
    accent: '#34d399',
    audience: 'Best for anchor sponsors that want to own a destination, event moment, or category story.',
    bestFor: 'Anchor sponsorships, partner programs, and larger event launches.',
    cta: 'Choose Landmark',
    demoHref: '/expo-3d?salesDemo=1&salesDemoStep=landmark',
    description: 'A flagship sponsor package with zone identity, hero surfaces, and event-level visibility.',
    deliverables: ['Zone sponsorship', 'Hero city screens', 'Event sponsor moment', 'Monthly sponsor report'],
    features: ['Zone naming rights', 'Hero sponsor presence', 'Event screen inventory', 'Sponsor report'],
    id: 'landmark',
    label: 'Landmark Zone',
    outcome: 'Own the most visible sponsor story in the Web3D expo city.',
    priceRange: 'From EUR 15k-50k+ / campaign',
    priceSignal: 'Flagship package',
    proof: 'Preview landmark city placement in the guided sales demo.',
    salesMetric: 'Zone visibility, event inventory, and sponsor reporting',
    title: 'Landmark Zone Sponsor',
  },
];

const PACKAGE_COMPARISON_ROWS = [
  ['Main goal', 'Product visibility', 'Qualified conversations', 'Category ownership'],
  ['What you buy', 'Booth and demo screen', 'Conversion booth and screen placement', 'Hero zone and event inventory'],
  ['Best use', 'Product launch or showcase', 'B2B demand generation and meetings', 'Anchor sponsorship or partner program'],
  ['Natural upgrade', 'Premium lead generation', 'Screen ownership and meeting flow', 'Event sponsor bundle'],
];

const SALES_ASSET_ROWS = [
  ['Walk the city', 'Explore the sponsor boulevard, booths, screens, and modular-home destination.', '/expo-3d'],
  ['Guided sponsor demo', 'Open the package walkthrough for Standard, Premium, and Landmark examples.', '/expo-3d?salesDemo=1'],
  ['Booth marketplace', 'Choose a specific booth position, see a price signal, and continue to checkout.', '/expo/booth-marketplace'],
  ['3D/Web3D estimate', 'Get a fast budget signal for expo booths, Web3D demos, or visual configurators.', '/visuals-calculator'],
  ['Request quote', 'Send package interest, sponsor goal, budget range, and optional media links.', '/expo/sponsor-packages#request-quote'],
];

const FUNNEL_STEPS = [
  ['1', 'Walk the city', 'See the sponsor boulevard, booth types, screen surfaces, and modular-home proof case.'],
  ['2', 'Choose a package', 'Pick Standard, Premium, or Landmark based on visibility, meetings, and ownership.'],
  ['3', 'Send booth details', 'Share your contact, sponsor goal, budget signal, timeline, and current website.'],
  ['4', 'Get the next step', 'Warpala follows up with a booth location, asset checklist, preview path, and quote.'],
];

const PACKAGE_INTEREST_OPTIONS: Array<{ label: string; value: SponsorPackageInterest }> = [
  { label: 'Premium Booth', value: 'premium' },
  { label: 'Standard Booth', value: 'standard' },
  { label: 'Landmark Zone Sponsor', value: 'landmark' },
  { label: 'Event / Arena Sponsor', value: 'arena' },
  { label: 'Help me choose', value: 'unsure' },
];

const BUDGET_OPTIONS = [
  'Up to EUR 5k',
  'EUR 5k-15k',
  'EUR 15k-50k',
  'EUR 50k+',
  'Need a package recommendation',
];

const TIMELINE_OPTIONS = [
  'This month',
  'Next month',
  'This quarter',
  'Planning for later',
];

const inputStyle: CSSProperties = {
  background: 'rgba(2, 6, 23, 0.78)',
  border: '1px solid rgba(148, 163, 184, 0.24)',
  borderRadius: '8px',
  boxSizing: 'border-box',
  color: '#f8fafc',
  font: 'inherit',
  minWidth: 0,
  padding: '13px 14px',
  textOverflow: 'ellipsis',
  width: '100%',
};

const labelStyle: CSSProperties = {
  color: '#cbd5e1',
  display: 'grid',
  fontSize: '0.78rem',
  fontWeight: 800,
  gap: '8px',
  minWidth: 0,
};

const sectionStyle: CSSProperties = {
  marginBottom: '28px',
};

function getStatusColor(tone: 'error' | 'idle' | 'submitting' | 'success') {
  switch (tone) {
    case 'error':
      return '#fecaca';
    case 'success':
      return '#bbf7d0';
    case 'submitting':
      return '#bae6fd';
    default:
      return '#94a3b8';
  }
}

function requestPlural(count: number) {
  return count === 1 ? 'request' : 'requests';
}

function getSelectedPackageCard(packageInterest: SponsorPackageInterest) {
  return SPONSOR_PACKAGES.find((entry) => entry.id === packageInterest) ?? null;
}

export default function SponsorPackages() {
  const [requestForm, setRequestForm] = useState<SponsorPackageRequestForm>(INITIAL_SPONSOR_PACKAGE_REQUEST_FORM);
  const [requestStatus, setRequestStatus] = useState<{ text: string; tone: 'error' | 'idle' | 'submitting' | 'success' }>({
    text: 'Choose a package, add contact details, and send a sponsor quote request.',
    tone: 'idle',
  });
  const [queuedRequestCount, setQueuedRequestCount] = useState(() => readSponsorPackageRequestQueue().length);
  const [pendingRequestCount, setPendingRequestCount] = useState(() => getPendingSponsorPackageRequestQueue().length);
  const [isSyncingBackups, setIsSyncingBackups] = useState(false);
  const requestInFlight = useRef(false);
  const selectedPackage = getSelectedPackageCard(requestForm.packageInterest);
  const previewAccent = selectedPackage?.accent ?? '#a78bfa';
  const previewPackageLabel = selectedPackage?.title ?? getSponsorPackageInterestLabel(requestForm.packageInterest);
  const previewHeadline = requestForm.sponsorHeadline.trim() || selectedPackage?.outcome || 'Sponsor presence, booth setup, and quote request.';
  const previewCta = requestForm.ctaLabel.trim() || 'Request quote';
  const hasLogo = Boolean(requestForm.logoUrl.trim());
  const hasMedia = Boolean(requestForm.mediaUrl.trim());
  const hasSavedRequests = queuedRequestCount > 0 || pendingRequestCount > 0;
  const setupReadiness = [
    ['Package', previewPackageLabel],
    ['Headline', requestForm.sponsorHeadline.trim() ? 'Ready' : 'Add headline'],
    ['Logo', hasLogo ? 'URL added' : 'Can add later'],
    ['Media', hasMedia ? 'URL added' : 'Can add later'],
    ['CTA', requestForm.ctaLabel.trim() ? requestForm.ctaLabel.trim() : 'Request quote'],
  ];

  function updateRequestField<Field extends keyof SponsorPackageRequestForm>(
    field: Field,
    value: SponsorPackageRequestForm[Field],
  ) {
    setRequestForm((current) => ({ ...current, [field]: value }));
  }

  function selectPackage(packageInterest: PackageCard['id']) {
    if (requestInFlight.current) return;
    const selectedPackage = SPONSOR_PACKAGES.find((entry) => entry.id === packageInterest);
    setRequestForm((current) => ({ ...current, packageInterest }));
    setRequestStatus({
      text: `${selectedPackage?.title ?? 'Sponsor package'} selected. Add contact details and your sponsor goal so we can prepare the right walkthrough.`,
      tone: 'idle',
    });

    if (typeof document !== 'undefined') {
      window.requestAnimationFrame(() => {
        document
          .querySelector('[data-sponsor-package-request-form="true"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  async function handleRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;

    const validationError = validateSponsorPackageRequestForm(requestForm);
    if (validationError) {
      setRequestStatus({ text: validationError, tone: 'error' });
      return;
    }

    const submittedForm = { ...requestForm };
    requestInFlight.current = true;
    setRequestStatus({ text: 'Sending sponsor request...', tone: 'submitting' });

    try {
      await submitSponsorPackageRequestToBackend(submittedForm);
      let backupText = 'Request was sent to the sponsor team.';

      try {
        const result = saveSponsorPackageRequest(submittedForm, {
          persistence: 'backend',
          syncStatus: 'backend-synced',
        });
        setQueuedRequestCount(result.queueCount);
        setPendingRequestCount(getPendingSponsorPackageRequestQueue().length);
        backupText = `A copy was kept on this device as request #${result.queueCount}.`;
      } catch {
        backupText = 'Request received, but this device could not keep a copy.';
      }

      setRequestForm({
        ...INITIAL_SPONSOR_PACKAGE_REQUEST_FORM,
        packageInterest: submittedForm.packageInterest,
      });
      setRequestStatus({
        text: `Sponsor request received. ${backupText} Next step: Warpala reviews the package, booth location, assets, and quote path.`,
        tone: 'success',
      });
    } catch (error) {
      const failure = getSponsorPackageRequestFailure(error);
      if (!failure.retryable) {
        setRequestStatus({ text: failure.message, tone: 'error' });
        return;
      }
      try {
        const result = saveSponsorPackageRequest(submittedForm);
        setQueuedRequestCount(result.queueCount);
        setPendingRequestCount(getPendingSponsorPackageRequestQueue().length);
        setRequestStatus({
          text: `${failure.message} This request has not been sent. A draft was saved on this device; use Send saved requests to try again.`,
          tone: 'error',
        });
      } catch (localError) {
        setRequestStatus({
          text: localError instanceof Error && localError.message === 'SPONSOR_PACKAGE_DRAFT_STORAGE_FULL'
            ? 'This device already has 50 unsent requests. Send the saved requests first. Your details remain in the form.'
            : 'The request has not been sent, and this device could not save a draft. Your details remain in the form; please try again later.',
          tone: 'error',
        });
      }
    } finally {
      requestInFlight.current = false;
    }
  }

  async function handleSyncPendingBackups() {
    if (pendingRequestCount === 0 || requestInFlight.current) {
      return;
    }

    requestInFlight.current = true;
    setIsSyncingBackups(true);
    setRequestStatus({ text: 'Sending saved sponsor requests...', tone: 'submitting' });

    try {
      const result = await syncPendingSponsorPackageRequests();
      setQueuedRequestCount(result.queueCount);
      setPendingRequestCount(result.pendingCount);

      if (result.failedCount > 0) {
        setRequestStatus({
          text: `Sent ${result.syncedCount} saved ${requestPlural(result.syncedCount)}. ${result.failedCount} could not be sent. ${getSponsorPackageRequestFailure(new Error(result.failures[0].error)).message} The saved drafts remain on this device.`,
          tone: 'error',
        });
        return;
      }

      setRequestStatus({
        text: result.syncedCount > 0
          ? `Sent ${result.syncedCount} saved sponsor ${requestPlural(result.syncedCount)}. They are now in the sponsor team queue.`
          : 'No saved requests are waiting to sync.',
        tone: 'success',
      });
    } catch {
      setRequestStatus({
          text: 'Saved requests could not be updated on this device. Please check the sponsor team before sending them again.',
          tone: 'error',
        });
    } finally {
      requestInFlight.current = false;
      setIsSyncingBackups(false);
    }
  }

  return (
    <main
      style={{
        background:
          'radial-gradient(circle at 12% 4%, rgba(56, 189, 248, 0.16), transparent 30%), linear-gradient(180deg, #020617 0%, #08111f 46%, #020617 100%)',
        color: '#f8fafc',
        minHeight: '100vh',
        padding: '42px 20px 72px',
      }}
    >
      <div style={{ margin: '0 auto', maxWidth: '1180px' }}>
        <header style={{ marginBottom: '34px' }}>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '18px', justifyContent: 'space-between' }}>
            <div style={{ alignItems: 'center', display: 'flex', gap: '16px', minWidth: 0 }}>
              <WarpalaLogo size={48} />
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <div style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase' }}>
                  Web3D Expo Sponsorship
                </div>
                <h1 style={{ fontSize: 'clamp(2.1rem, 6vw, 4.8rem)', letterSpacing: 0, lineHeight: 0.98, margin: '6px 0 0', maxWidth: 860 }}>
                  Sponsor a Web3D expo city, not a static banner.
                </h1>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <Link className="btn-glass" to="/expo-3d" style={{ textDecoration: 'none' }}>
                Walk city
              </Link>
              <Link className="btn-glass" to="/expo/booth-marketplace" style={{ textDecoration: 'none' }}>
                Rent booth
              </Link>
              <Link className="btn-glass" to="/visuals-calculator" style={{ textDecoration: 'none' }}>
                Estimate 3D demo
              </Link>
            </div>
          </div>
        </header>

        <section style={sectionStyle}>
          <div style={{ display: 'grid', gap: '22px', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
            <div>
              <p style={{ color: '#dbeafe', fontSize: '1.14rem', fontWeight: 850, lineHeight: 1.48, margin: '0 0 14px', maxWidth: 800 }}>
                Choose a booth package, provide your brand assets, preview the sponsor surface, and request a quote.
              </p>
              <p style={{ color: '#cbd5e1', fontSize: '1.02rem', lineHeight: 1.62, margin: 0, maxWidth: 820 }}>
                Warpala sells sponsor space as a live Web3D city: booths, city screens, event surfaces, and destination proof cases such as the modular-home studio.
              </p>
            </div>
            <div style={{ background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(125, 211, 252, 0.22)', borderRadius: 8, padding: 18 }}>
              <div style={{ color: '#93c5fd', fontSize: '0.72rem', fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase' }}>
                Buyer flow
              </div>
              <div style={{ color: '#f8fafc', fontSize: '1.38rem', fontWeight: 950, marginTop: 8 }}>
                City tour - package - assets - preview - quote
              </div>
              <p style={{ color: '#94a3b8', lineHeight: 1.45, margin: '8px 0 0' }}>
                Bring a goal, rough budget, and timeline. Warpala confirms the right package, booth location, assets, preview path, and quote.
              </p>
            </div>
          </div>
        </section>

        <section style={{ ...sectionStyle, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
          {FUNNEL_STEPS.map(([step, title, copy]) => (
            <div
              key={step}
              style={{
                background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.86), rgba(2, 6, 23, 0.68))',
                border: '1px solid rgba(148, 163, 184, 0.16)',
                borderRadius: 8,
                padding: 18,
              }}
            >
              <div style={{ color: '#38bdf8', fontSize: '0.72rem', fontWeight: 950, letterSpacing: 0, textTransform: 'uppercase' }}>
                Step {step}
              </div>
              <h2 style={{ fontSize: '1.12rem', margin: '8px 0 7px' }}>{title}</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.45, margin: 0 }}>{copy}</p>
            </div>
          ))}
        </section>

        <section style={{ ...sectionStyle, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
          {SPONSOR_PACKAGES.map((entry) => (
            <article
              key={entry.id}
              className="glass-card"
              style={{
                borderColor: `${entry.accent}55`,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 420,
                padding: 22,
              }}
            >
              <div style={{ color: entry.accent, fontSize: '0.68rem', fontWeight: 950, letterSpacing: 0, textTransform: 'uppercase' }}>
                {entry.priceSignal}
              </div>
              <h2 style={{ fontSize: '1.55rem', letterSpacing: 0, lineHeight: 1.05, margin: '10px 0' }}>{entry.title}</h2>
              <div style={{ background: `${entry.accent}18`, border: `1px solid ${entry.accent}44`, borderRadius: 8, color: '#f8fafc', fontSize: '0.92rem', fontWeight: 900, marginBottom: 12, padding: '10px 12px' }}>
                {entry.priceRange}
              </div>
              <p style={{ color: '#cbd5e1', lineHeight: 1.48, margin: 0 }}>{entry.description}</p>
              <p style={{ color: '#e2e8f0', fontSize: '0.92rem', fontWeight: 800, lineHeight: 1.45, margin: '12px 0 0' }}>
                {entry.bestFor}
              </p>
              <ul style={{ display: 'grid', gap: 10, listStyle: 'none', margin: '18px 0', padding: 0 }}>
                {entry.features.map((feature) => (
                  <li key={feature} style={{ alignItems: 'center', color: '#f8fafc', display: 'flex', gap: 10, fontSize: '0.93rem' }}>
                    <span style={{ background: entry.accent, borderRadius: 999, display: 'inline-block', height: 7, width: 7 }} />
                    {feature}
                  </li>
                ))}
              </ul>
              <div style={{ background: 'rgba(2, 6, 23, 0.42)', border: '1px solid rgba(148, 163, 184, 0.16)', borderRadius: 8, display: 'grid', gap: 9, marginBottom: 14, padding: 13 }}>
                <div style={{ color: entry.accent, fontSize: '0.68rem', fontWeight: 950, letterSpacing: 0, textTransform: 'uppercase' }}>
                  Included
                </div>
                {entry.deliverables.map((item) => (
                  <div key={item} style={{ color: '#cbd5e1', fontSize: '0.84rem', fontWeight: 750 }}>
                    {item}
                  </div>
                ))}
              </div>
              <p style={{ color: '#f8fafc', fontWeight: 850, lineHeight: 1.45, margin: 'auto 0 8px' }}>{entry.outcome}</p>
              <p style={{ color: '#dbeafe', fontSize: '0.86rem', fontWeight: 850, lineHeight: 1.42, margin: '0 0 8px' }}>
                Metric: {entry.salesMetric}
              </p>
              <p style={{ color: '#94a3b8', lineHeight: 1.45, margin: '0 0 10px' }}>{entry.audience}</p>
              <p style={{ color: entry.accent, fontSize: '0.82rem', fontWeight: 850, lineHeight: 1.4, margin: '0 0 16px' }}>{entry.proof}</p>
              <div style={{ display: 'grid', gap: 9, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))' }}>
                <button
                  onClick={() => selectPackage(entry.id)}
                  style={{
                    background: `linear-gradient(135deg, ${entry.accent}, #f8fafc)`,
                    border: 'none',
                    borderRadius: 8,
                    color: '#020617',
                    cursor: 'pointer',
                    fontSize: '0.76rem',
                    fontWeight: 950,
                    letterSpacing: 0,
                    padding: '11px 12px',
                    textTransform: 'uppercase',
                  }}
                  type="button"
                >
                  {entry.cta}
                </button>
                <Link
                  to={entry.demoHref}
                  style={{
                    alignItems: 'center',
                    background: 'rgba(15, 23, 42, 0.72)',
                    border: `1px solid ${entry.accent}55`,
                    borderRadius: 8,
                    color: '#e0f2fe',
                    display: 'flex',
                    fontSize: '0.76rem',
                    fontWeight: 900,
                    justifyContent: 'center',
                    padding: '10px 12px',
                    textDecoration: 'none',
                    textTransform: 'uppercase',
                  }}
                >
                  View demo
                </Link>
              </div>
              <div style={{ marginTop: 12 }}>
                <span style={{ background: `${entry.accent}1c`, border: `1px solid ${entry.accent}55`, borderRadius: 999, color: entry.accent, fontSize: '0.68rem', fontWeight: 950, letterSpacing: 0, padding: '7px 10px', textTransform: 'uppercase' }}>
                  {entry.label}
                </span>
              </div>
            </article>
          ))}
        </section>

        <section style={{ ...sectionStyle, background: 'rgba(15, 23, 42, 0.42)', border: '1px solid rgba(148, 163, 184, 0.16)', borderRadius: 8, padding: 24 }}>
          <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ color: '#fbbf24', fontSize: '0.72rem', fontWeight: 950, letterSpacing: 0, textTransform: 'uppercase' }}>
                Package comparison
              </div>
              <h2 style={{ fontSize: '1.7rem', letterSpacing: 0, margin: '6px 0 0' }}>
                From booth to boulevard ownership.
              </h2>
            </div>
            <Link className="btn-glass" to="/expo-3d?salesDemo=1" style={{ textDecoration: 'none' }}>
              Open demo
            </Link>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: '#94a3b8', display: 'grid', fontSize: '0.72rem', fontWeight: 950, gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', letterSpacing: 0, textTransform: 'uppercase' }}>
              <span>Question</span>
              <span>Standard</span>
              <span>Premium</span>
              <span>Landmark</span>
            </div>
            {PACKAGE_COMPARISON_ROWS.map(([label, standard, premium, landmark]) => (
              <div
                key={label}
                style={{
                  background: 'rgba(15, 23, 42, 0.58)',
                  border: '1px solid rgba(148, 163, 184, 0.16)',
                  borderRadius: 8,
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
                  padding: 14,
                }}
              >
                <strong style={{ color: '#f8fafc' }}>{label}</strong>
                <span style={{ color: '#bae6fd' }}>{standard}</span>
                <span style={{ color: '#fde68a' }}>{premium}</span>
                <span style={{ color: '#bbf7d0' }}>{landmark}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          data-sponsor-package-request-form="true"
          id="request-quote"
          style={{ ...sectionStyle, background: 'rgba(2, 6, 23, 0.38)', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: 8, padding: 26 }}
        >
          <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
            <div>
              <div style={{ color: '#34d399', fontSize: '0.74rem', fontWeight: 950, letterSpacing: 0, textTransform: 'uppercase' }}>
                Sponsor request
              </div>
              <h2 style={{ fontSize: 'clamp(1.9rem, 4vw, 3.2rem)', letterSpacing: 0, lineHeight: 1, margin: '10px 0 12px' }}>
                Request a sponsor quote.
              </h2>
              <p style={{ color: '#cbd5e1', fontSize: '1rem', lineHeight: 1.58, margin: 0 }}>
                Tell us what you want to promote. We will reply with the right package, booth or screen setup path, asset checklist, preview path, and quote.
              </p>
              {hasSavedRequests ? (
                <div style={{ background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(52, 211, 153, 0.26)', borderRadius: 8, color: '#bbf7d0', fontSize: '0.85rem', fontWeight: 800, lineHeight: 1.45, marginTop: 18, padding: '14px 15px' }}>
                  <div>
                    Saved on this device: {queuedRequestCount} {requestPlural(queuedRequestCount)}.
                  </div>
                  <div style={{ color: pendingRequestCount > 0 ? '#fde68a' : '#bbf7d0', marginTop: 8 }}>
                    Waiting to send: {pendingRequestCount}
                  </div>
                  {pendingRequestCount > 0 && (
                    <button
                      disabled={isSyncingBackups || requestStatus.tone === 'submitting'}
                      onClick={handleSyncPendingBackups}
                      style={{
                        background: 'rgba(250, 204, 21, 0.14)',
                        border: '1px solid rgba(250, 204, 21, 0.38)',
                        borderRadius: 8,
                        color: '#fef3c7',
                        cursor: isSyncingBackups ? 'wait' : 'pointer',
                        font: 'inherit',
                        fontSize: '0.76rem',
                        fontWeight: 950,
                        letterSpacing: 0,
                        marginTop: 12,
                        padding: '10px 12px',
                        textTransform: 'uppercase',
                      }}
                      type="button"
                    >
                      {isSyncingBackups ? 'Sending...' : 'Send saved requests'}
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(52, 211, 153, 0.22)', borderRadius: 8, color: '#bbf7d0', fontSize: '0.85rem', fontWeight: 800, lineHeight: 1.45, marginTop: 18, padding: '14px 15px' }}>
                  After you send the request, Warpala reviews fit, inventory, assets, and quote options before the booth or screen is published.
                </div>
              )}
              <div
                data-sponsor-setup-preview="true"
                style={{
                  background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.74))',
                  border: `1px solid ${previewAccent}55`,
                  borderRadius: 8,
                  display: 'grid',
                  gap: 13,
                  marginTop: 18,
                  padding: 18,
                }}
              >
                <div style={{ alignItems: 'center', display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                  <span style={{ color: previewAccent, fontSize: '0.7rem', fontWeight: 950, letterSpacing: 0, textTransform: 'uppercase' }}>
                    Booth preview
                  </span>
                  <span style={{ background: `${previewAccent}18`, border: `1px solid ${previewAccent}44`, borderRadius: 999, color: '#f8fafc', fontSize: '0.68rem', fontWeight: 950, padding: '6px 9px', textTransform: 'uppercase' }}>
                    {previewPackageLabel}
                  </span>
                </div>
                <div style={{ background: 'rgba(2, 6, 23, 0.68)', border: '1px solid rgba(148, 163, 184, 0.16)', borderRadius: 8, minHeight: 138, padding: 16 }}>
                  <div style={{ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 12 }}>
                    <div style={{ alignItems: 'center', background: hasLogo ? '#e0f2fe' : `${previewAccent}24`, border: `1px solid ${previewAccent}55`, borderRadius: 8, color: hasLogo ? '#0f172a' : previewAccent, display: 'flex', fontSize: '0.72rem', fontWeight: 950, height: 44, justifyContent: 'center', width: 44 }}>
                      {hasLogo ? 'LOGO' : 'ADD'}
                    </div>
                    <div>
                      <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 950, lineHeight: 1.15 }}>
                        {requestForm.company.trim() || 'Sponsor company'}
                      </div>
                      <div style={{ color: previewAccent, fontSize: '0.72rem', fontWeight: 900, marginTop: 3 }}>
                        {hasMedia ? 'Media ready for screen preview' : 'Generated booth card until media is supplied'}
                      </div>
                    </div>
                  </div>
                  <div style={{ color: '#ffffff', fontSize: '1.28rem', fontWeight: 950, lineHeight: 1.12, marginBottom: 10 }}>
                    {previewHeadline}
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '0.86rem', lineHeight: 1.42, marginBottom: 12 }}>
                    {requestForm.message.trim() || selectedPackage?.description || 'Share your campaign goal so the booth can be configured around the right offer.'}
                  </div>
                  <span style={{ background: previewAccent, borderRadius: 8, color: '#020617', display: 'inline-block', fontSize: '0.72rem', fontWeight: 950, padding: '8px 11px', textTransform: 'uppercase' }}>
                    {previewCta}
                  </span>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {setupReadiness.map(([label, value]) => (
                    <div key={label} style={{ alignItems: 'center', display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.76rem', fontWeight: 850 }}>{label}</span>
                      <span style={{ color: '#e2e8f0', fontSize: '0.76rem', fontWeight: 900, textAlign: 'right' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleRequestSubmit} style={{ display: 'grid', gap: 13 }}>
              <div style={{ display: 'grid', gap: 13, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
                <label style={labelStyle}>
                  Contact name
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    autoComplete="name"
                    onChange={(event) => updateRequestField('name', event.target.value)}
                    placeholder="Name Surname"
                    style={inputStyle}
                    type="text"
                    value={requestForm.name}
                  />
                </label>
                <label style={labelStyle}>
                  Work email
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    autoComplete="email"
                    onChange={(event) => updateRequestField('email', event.target.value)}
                    placeholder="name@company.com"
                    style={inputStyle}
                    type="email"
                    value={requestForm.email}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gap: 13, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
                <label style={labelStyle}>
                  Company
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    autoComplete="organization"
                    onChange={(event) => updateRequestField('company', event.target.value)}
                    placeholder="Company name"
                    style={inputStyle}
                    type="text"
                    value={requestForm.company}
                  />
                </label>
                <label style={labelStyle}>
                  Phone / WhatsApp
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    autoComplete="tel"
                    onChange={(event) => updateRequestField('phone', event.target.value)}
                    placeholder="+1 555 0100"
                    style={inputStyle}
                    type="tel"
                    value={requestForm.phone}
                  />
                </label>
                <label style={labelStyle}>
                  Website
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    autoComplete="url"
                    onChange={(event) => updateRequestField('website', event.target.value)}
                    placeholder="https://company.com"
                    style={inputStyle}
                    type="url"
                    value={requestForm.website}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gap: 13, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
                <label style={labelStyle}>
                  Package
                  <select
                    disabled={requestStatus.tone === 'submitting'}
                    onChange={(event) => updateRequestField('packageInterest', event.target.value as SponsorPackageInterest)}
                    style={inputStyle}
                    value={requestForm.packageInterest}
                  >
                    {PACKAGE_INTEREST_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  Budget range
                  <select
                    disabled={requestStatus.tone === 'submitting'}
                    onChange={(event) => updateRequestField('budgetRange', event.target.value)}
                    style={inputStyle}
                    value={requestForm.budgetRange}
                  >
                    <option value="">Choose range</option>
                    {BUDGET_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  Timeline
                  <select
                    disabled={requestStatus.tone === 'submitting'}
                    onChange={(event) => updateRequestField('timeline', event.target.value)}
                    style={inputStyle}
                    value={requestForm.timeline}
                  >
                    <option value="">Choose timeline</option>
                    {TIMELINE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gap: 13, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
                <label style={labelStyle}>
                  Booth headline
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    onChange={(event) => updateRequestField('sponsorHeadline', event.target.value)}
                    placeholder="What should visitors remember?"
                    style={inputStyle}
                    type="text"
                    value={requestForm.sponsorHeadline}
                  />
                </label>
                <label style={labelStyle}>
                  CTA label
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    onChange={(event) => updateRequestField('ctaLabel', event.target.value)}
                    placeholder="Request demo"
                    style={inputStyle}
                    type="text"
                    value={requestForm.ctaLabel}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gap: 13, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
                <label style={labelStyle}>
                  Logo link (optional)
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    autoComplete="url"
                    onChange={(event) => updateRequestField('logoUrl', event.target.value)}
                    placeholder="https://cdn.company.com/logo.webp"
                    style={inputStyle}
                    type="url"
                    value={requestForm.logoUrl}
                  />
                </label>
                <label style={labelStyle}>
                  Screen media link (optional)
                  <input
                    disabled={requestStatus.tone === 'submitting'}
                    autoComplete="url"
                    onChange={(event) => updateRequestField('mediaUrl', event.target.value)}
                    placeholder="https://cdn.company.com/screen.webp"
                    style={inputStyle}
                    type="url"
                    value={requestForm.mediaUrl}
                  />
                </label>
              </div>
              <label style={labelStyle}>
                Sponsor goal
                <textarea
                    disabled={requestStatus.tone === 'submitting'}
                  onChange={(event) => updateRequestField('message', event.target.value)}
                  placeholder="What do you want to promote, launch, measure, or sponsor?"
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  value={requestForm.message}
                />
              </label>
              <button
                disabled={requestStatus.tone === 'submitting'}
                type="submit"
                style={{
                  background: 'linear-gradient(135deg, #22c55e, #0ea5e9)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#03131a',
                  cursor: requestStatus.tone === 'submitting' ? 'wait' : 'pointer',
                  fontSize: '0.92rem',
                  fontWeight: 950,
                  letterSpacing: 0,
                  opacity: requestStatus.tone === 'submitting' ? 0.72 : 1,
                  padding: '15px 18px',
                  textTransform: 'uppercase',
                }}
              >
                {requestStatus.tone === 'submitting' ? 'Sending request...' : 'Request quote'}
              </button>
              <div
                data-sponsor-package-request-status={requestStatus.tone}
                role="status"
                aria-live="polite"
                style={{
                  color: getStatusColor(requestStatus.tone),
                  fontSize: '0.82rem',
                  fontWeight: 750,
                  lineHeight: 1.45,
                }}
              >
                {requestStatus.text}
              </div>
            </form>
          </div>
        </section>

        <section style={{ background: 'rgba(15, 23, 42, 0.42)', border: '1px solid rgba(148, 163, 184, 0.16)', borderRadius: 8, padding: 24 }}>
          <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.65rem', letterSpacing: 0, margin: 0 }}>What buyers can open now</h2>
            <span style={{ color: '#94a3b8', fontSize: '0.76rem', fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase' }}>
              Buyer links
            </span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {SALES_ASSET_ROWS.map(([name, status, href]) => (
              <Link
                key={name}
                to={href}
                style={{
                  alignItems: 'center',
                  background: 'rgba(15, 23, 42, 0.58)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  borderRadius: 8,
                  color: '#f8fafc',
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                  padding: '14px 16px',
                  textDecoration: 'none',
                }}
              >
                <strong>{name}</strong>
                <span style={{ color: '#cbd5e1' }}>{status}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { isBoothProductPreviewEnabled } from './boothProductPreviewFlags';
import {
  INITIAL_SPONSOR_CONCIERGE_LEAD_FORM,
  submitSponsorConciergeLead,
  validateSponsorConciergeLeadForm,
  type SponsorConciergeLeadFormState,
} from './sponsorConciergeLeadCapture';

type SubmitStatus =
  | { message: string; tone: 'idle' }
  | { message: string; tone: 'error' }
  | { message: string; tone: 'submitting' }
  | { message: string; tone: 'warning' }
  | { message: string; tone: 'success' };

type SponsorConciergeLeadCaptureOverlayProps = {
  isTouchDevice?: boolean;
};

export function SponsorConciergeLeadCaptureOverlay({
  isTouchDevice = false,
}: SponsorConciergeLeadCaptureOverlayProps) {
  const previewEnabled = isBoothProductPreviewEnabled();
  const [isExpanded, setIsExpanded] = useState(false);
  const [form, setForm] = useState<SponsorConciergeLeadFormState>(INITIAL_SPONSOR_CONCIERGE_LEAD_FORM);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>({
    message: 'Submits to the expo lead API when available; falls back to local preview storage.',
    tone: 'idle',
  });
  const isFormReady = useMemo(() => validateSponsorConciergeLeadForm(form) === null, [form]);

  if (!previewEnabled) {
    return null;
  }

  const updateField = (field: keyof SponsorConciergeLeadFormState) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const nextValue = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
    if (submitStatus.tone !== 'idle') {
      setSubmitStatus({
        message: 'Submits to the expo lead API when available; falls back to local preview storage.',
        tone: 'idle',
      });
    }
  };

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateSponsorConciergeLeadForm(form);

    if (validationError) {
      setSubmitStatus({ message: validationError, tone: 'error' });
      return;
    }

    try {
      setSubmitStatus({ message: 'Sending sponsor lead...', tone: 'submitting' });
      const result = await submitSponsorConciergeLead(form);
      if (result.persistence === 'backend') {
        setSubmitStatus({
          message: 'Lead sent to the staging sponsor inbox. No booking or AI workflow started.',
          tone: 'success',
        });
        setForm(INITIAL_SPONSOR_CONCIERGE_LEAD_FORM);
        return;
      }

      setSubmitStatus({
        message: `Lead API unavailable (${result.reason}); saved locally for handoff. Queue: ${result.localQueueCount}.`,
        tone: 'warning',
      });
    } catch {
      setSubmitStatus({
        message: 'Lead capture failed before submit. Check required fields and try again.',
        tone: 'error',
      });
    }
  };

  const fieldStyle = {
    background: 'rgba(2, 6, 23, 0.58)',
    border: '1px solid rgba(148, 163, 184, 0.24)',
    borderRadius: '11px',
    color: '#f8fafc',
    font: 'inherit',
    fontSize: isTouchDevice ? '0.72rem' : '0.74rem',
    fontWeight: 750,
    outline: 'none',
    padding: isTouchDevice ? '8px 9px' : '8px 10px',
    width: '100%',
  } as const;

  const statusColor = submitStatus.tone === 'success'
    ? '#86efac'
    : submitStatus.tone === 'warning'
      ? '#fde68a'
    : submitStatus.tone === 'error'
      ? '#fecaca'
      : '#a8b5c7';
  const isSubmitting = submitStatus.tone === 'submitting';

  return (
    <form
      aria-label="Sponsor Concierge lead capture"
      data-booth-product-lead-capture-booth="sponsor-concierge"
      data-booth-product-lead-capture-overlay="true"
      data-booth-product-lead-submit-mode="backend-with-local-fallback"
      onSubmit={submitLead}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      style={{
        background:
          'radial-gradient(circle at 100% 0%, rgba(34, 197, 94, 0.16), transparent 32%), linear-gradient(180deg, rgba(6, 12, 24, 0.92), rgba(15, 23, 42, 0.8))',
        border: '1px solid rgba(134, 239, 172, 0.3)',
        borderRadius: isTouchDevice ? '17px' : '20px',
        bottom: isTouchDevice ? 'auto' : '26px',
        boxShadow: '0 22px 54px rgba(2, 6, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        color: '#f8fafc',
        display: 'grid',
        gap: isTouchDevice ? '8px' : '9px',
        fontFamily: 'inherit',
        padding: isTouchDevice ? '11px 12px' : '14px 15px',
        pointerEvents: 'auto',
        position: 'absolute',
        right: isTouchDevice ? '12px' : '26px',
        left: isTouchDevice ? '12px' : 'auto',
        maxHeight: isTouchDevice ? 'calc(100dvh - 260px)' : 'none',
        overflowY: isTouchDevice ? 'auto' : 'visible',
        top: isTouchDevice ? 'max(126px, calc(env(safe-area-inset-top) + 122px))' : 'auto',
        width: isTouchDevice ? 'auto' : '318px',
        zIndex: 116,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start' }}>
        <div>
          <div style={{ color: '#86efac', fontSize: '0.58rem', fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Premium lead capture
          </div>
          <div style={{ marginTop: '3px', color: '#f8fafc', fontSize: isTouchDevice ? '0.82rem' : '0.9rem', fontWeight: 950 }}>
            Sponsor Concierge
          </div>
          <div style={{ color: '#cbd5e1', fontSize: isTouchDevice ? '0.62rem' : '0.66rem', fontWeight: 750, lineHeight: 1.28 }}>
            Capture meeting interest for the premium sponsor package.
          </div>
        </div>
        {isTouchDevice ? (
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls="sponsor-concierge-fields"
            onClick={() => setIsExpanded((value) => !value)}
            style={{ background: 'rgba(34, 197, 94, 0.14)', border: '1px solid rgba(134, 239, 172, 0.3)', borderRadius: 8, color: '#bbf7d0', cursor: 'pointer', flexShrink: 0, font: 'inherit', fontSize: '0.65rem', minHeight: 44, padding: '8px 10px' }}
          >
            {isExpanded ? 'Close sponsor form' : 'Open sponsor form'}
          </button>
        ) : <span
          style={{
            border: '1px solid rgba(125, 211, 252, 0.32)',
            borderRadius: '999px',
            color: '#bae6fd',
            fontSize: '0.52rem',
            fontWeight: 950,
            letterSpacing: '0.1em',
            padding: '4px 7px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Lead MVP
        </span>}
      </div>

      <div id="sponsor-concierge-fields" style={{ display: isTouchDevice && !isExpanded ? 'none' : 'grid', gap: '7px' }}>
        <input
          aria-label="Contact name"
          data-booth-product-lead-field="name"
          onChange={updateField('name')}
          placeholder="Name"
          style={fieldStyle}
          value={form.name}
        />
        <input
          aria-label="Work email"
          data-booth-product-lead-field="email"
          inputMode="email"
          onChange={updateField('email')}
          placeholder="Work email"
          style={fieldStyle}
          type="email"
          value={form.email}
        />
        <input
          aria-label="Company"
          data-booth-product-lead-field="company"
          onChange={updateField('company')}
          placeholder="Company"
          style={fieldStyle}
          value={form.company}
        />
        <textarea
          aria-label="Sponsor interest"
          data-booth-product-lead-field="interest"
          onChange={updateField('interest')}
          placeholder="Interested in meetings, Demo Arena sponsorship, or lead reports?"
          rows={2}
          style={{ ...fieldStyle, resize: 'none' }}
          value={form.interest}
        />
      </div>

      {(!isTouchDevice || isExpanded) && <button
        data-booth-product-lead-submit="true"
        disabled={isSubmitting}
        style={{
          background: isFormReady && !isSubmitting
            ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.94), rgba(20, 184, 166, 0.82))'
            : 'rgba(71, 85, 105, 0.62)',
          border: '1px solid rgba(220, 252, 231, 0.2)',
          borderRadius: '999px',
          color: isFormReady && !isSubmitting ? '#052e16' : '#cbd5e1',
          cursor: isSubmitting ? 'progress' : 'pointer',
          fontSize: isTouchDevice ? '0.64rem' : '0.68rem',
          fontWeight: 950,
          letterSpacing: '0.08em',
          padding: isTouchDevice ? '8px 10px' : '9px 12px',
          textTransform: 'uppercase',
        }}
        type="submit"
      >
        {isSubmitting ? 'Sending Lead...' : 'Send Sponsor Lead'}
      </button>}

      {(!isTouchDevice || isExpanded) && <div
        data-booth-product-lead-status={submitStatus.tone}
        style={{
          borderTop: '1px solid rgba(148, 163, 184, 0.14)',
          color: statusColor,
          fontSize: '0.58rem',
          fontWeight: 800,
          lineHeight: 1.25,
          paddingTop: '7px',
        }}
      >
        {submitStatus.message}
      </div>}
    </form>
  );
}

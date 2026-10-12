import { ExpoDataAPI } from '../../services/expo';

export type SponsorPackageInterest = 'arena' | 'landmark' | 'premium' | 'standard' | 'unsure';

export type SponsorPackageRequestPersistence = 'backend' | 'local-preview';

export type SponsorPackageRequestSyncStatus = 'backend-pending' | 'backend-synced';

export type SponsorPackageRequestForm = {
  budgetRange: string;
  ctaLabel: string;
  company: string;
  email: string;
  logoUrl: string;
  mediaUrl: string;
  message: string;
  name: string;
  packageInterest: SponsorPackageInterest;
  phone: string;
  sponsorHeadline: string;
  timeline: string;
  website: string;
};

export type SponsorPackageRequestRecord = SponsorPackageRequestForm & {
  capturedAt: string;
  id: string;
  persistence: SponsorPackageRequestPersistence;
  sourcePath: string;
  syncStatus: SponsorPackageRequestSyncStatus;
};

export type SponsorPackageLeadPayload = {
  clientEmail: string;
  clientName: string;
  companyId: string;
  companySlug: string;
  message: string;
  sourcePath: string;
};

export const SPONSOR_PACKAGE_REQUEST_STORAGE_KEY = 'warpala.expo.sponsorPackageRequests';

// The API resolves this stable slug against the current database.
const SPONSOR_PACKAGE_LEAD_COMPANY_SLUG = 'sponsor-concierge';
const MAX_SAVED_REQUESTS = 50;

export const INITIAL_SPONSOR_PACKAGE_REQUEST_FORM: SponsorPackageRequestForm = {
  budgetRange: '',
  ctaLabel: '',
  company: '',
  email: '',
  logoUrl: '',
  mediaUrl: '',
  message: '',
  name: '',
  packageInterest: 'premium',
  phone: '',
  sponsorHeadline: '',
  timeline: '',
  website: '',
};

export function normalizeSponsorPackageRequestForm(
  form: SponsorPackageRequestForm,
): SponsorPackageRequestForm {
  return {
    budgetRange: form.budgetRange.trim(),
    ctaLabel: form.ctaLabel.trim(),
    company: form.company.trim(),
    email: form.email.trim(),
    logoUrl: form.logoUrl.trim(),
    mediaUrl: form.mediaUrl.trim(),
    message: form.message.trim(),
    name: form.name.trim(),
    packageInterest: form.packageInterest,
    phone: form.phone.trim(),
    sponsorHeadline: form.sponsorHeadline.trim(),
    timeline: form.timeline.trim(),
    website: form.website.trim(),
  };
}

function isOptionalPublicHttpsUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function validateSponsorPackageRequestForm(form: SponsorPackageRequestForm) {
  const normalized = normalizeSponsorPackageRequestForm(form);

  if (!normalized.name) {
    return 'Enter a contact name.';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    return 'Enter a valid work email.';
  }

  if (!normalized.company) {
    return 'Enter a company name.';
  }

  if (!normalized.message) {
    return 'Add what you want to sponsor or discuss.';
  }

  if (!isOptionalPublicHttpsUrl(normalized.logoUrl)) {
    return 'Use a public HTTPS logo URL or leave it blank.';
  }

  if (!isOptionalPublicHttpsUrl(normalized.mediaUrl)) {
    return 'Use a public HTTPS media URL or leave it blank.';
  }

  return null;
}

export function getSponsorPackageInterestLabel(packageInterest: SponsorPackageInterest) {
  switch (packageInterest) {
    case 'arena':
      return 'Demo Arena Sponsor';
    case 'landmark':
      return 'Landmark Zone Sponsor';
    case 'premium':
      return 'Premium Booth';
    case 'standard':
      return 'Standard Booth';
    case 'unsure':
      return 'Not sure yet';
    default:
      return 'Not sure yet';
  }
}

export function getSponsorPackageRequestSourcePath() {
  if (typeof window === 'undefined') {
    return '/expo/sponsor-packages';
  }

  return `${window.location.pathname}${window.location.search}`;
}

export function readSponsorPackageRequestQueue(): SponsorPackageRequestRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(SPONSOR_PACKAGE_REQUEST_STORAGE_KEY);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_SAVED_REQUESTS) as SponsorPackageRequestRecord[] : [];
  } catch {
    return [];
  }
}

function writeSponsorPackageRequestQueue(queue: SponsorPackageRequestRecord[]) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SPONSOR_PACKAGE_REQUEST_STORAGE_KEY, JSON.stringify(queue.slice(-MAX_SAVED_REQUESTS)));
  }
}

export function getPendingSponsorPackageRequestQueue(queue = readSponsorPackageRequestQueue()) {
  return queue.filter((record) => record.syncStatus === 'backend-pending');
}

export function buildSponsorPackageLeadPayload(
  form: SponsorPackageRequestForm,
  sourcePath = getSponsorPackageRequestSourcePath(),
): SponsorPackageLeadPayload {
  const normalized = normalizeSponsorPackageRequestForm(form);
  const details = [
    `Sponsor package interest: ${getSponsorPackageInterestLabel(normalized.packageInterest)}`,
    `Sponsor company: ${normalized.company}`,
    normalized.phone ? `Contact phone: ${normalized.phone}` : null,
    normalized.website ? `Website: ${normalized.website}` : null,
    normalized.logoUrl ? `Logo URL: ${normalized.logoUrl}` : null,
    normalized.mediaUrl ? `Media URL: ${normalized.mediaUrl}` : null,
    normalized.sponsorHeadline ? `Booth headline: ${normalized.sponsorHeadline}` : null,
    normalized.ctaLabel ? `Preferred CTA: ${normalized.ctaLabel}` : null,
    normalized.budgetRange ? `Budget signal: ${normalized.budgetRange}` : null,
    normalized.timeline ? `Timeline: ${normalized.timeline}` : null,
    '',
    normalized.message,
  ].filter((line): line is string => line !== null);

  return {
    clientEmail: normalized.email,
    clientName: normalized.name,
    companyId: SPONSOR_PACKAGE_LEAD_COMPANY_SLUG,
    companySlug: SPONSOR_PACKAGE_LEAD_COMPANY_SLUG,
    message: details.join('\n'),
    sourcePath,
  };
}

export async function submitSponsorPackageRequestToBackend(form: SponsorPackageRequestForm) {
  return await ExpoDataAPI.createExpoLead(buildSponsorPackageLeadPayload(form));
}

export function getSponsorPackageRequestFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number(message.match(/^SERVER_API_HTTP_(\d{3})(?:\b|:)/)?.[1]);

  if (status === 409 && message.includes('EXPO_LEAD_DUPLICATE')) {
    return { retryable: false, message: 'A request from this email is already in the sponsor team queue. Please wait for a reply before sending another.' };
  }
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { retryable: false, message: 'The sponsor team could not accept this request. Check your details before sending again.' };
  }
  return {
    retryable: true,
    message: status === 429
      ? 'Too many requests were sent. Please wait before trying again.'
      : 'The sponsor team could not be reached. Please try again later.',
  };
}

export async function syncPendingSponsorPackageRequests() {
  const queue = readSponsorPackageRequestQueue();
  const pendingRecords = getPendingSponsorPackageRequestQueue(queue);
  const syncedIds = new Set<string>();
  const failures: Array<{ error: string; id: string }> = [];

  for (const record of pendingRecords) {
    try {
      await ExpoDataAPI.createExpoLead(buildSponsorPackageLeadPayload(record, record.sourcePath));
      syncedIds.add(record.id);
    } catch (error) {
      failures.push({
        error: error instanceof Error ? error.message : String(error),
        id: record.id,
      });
    }
  }

  // A new draft may have been saved while the network requests were in flight.
  const nextQueue = readSponsorPackageRequestQueue().map((record) =>
    syncedIds.has(record.id)
      ? {
          ...record,
          persistence: 'backend' as const,
          syncStatus: 'backend-synced' as const,
        }
      : record,
  );

  writeSponsorPackageRequestQueue(nextQueue);

  return {
    failedCount: failures.length,
    failures,
    pendingCount: getPendingSponsorPackageRequestQueue(nextQueue).length,
    queueCount: nextQueue.length,
    syncedCount: syncedIds.size,
  };
}

export function saveSponsorPackageRequest(
  form: SponsorPackageRequestForm,
  options: {
    persistence?: SponsorPackageRequestPersistence;
    syncStatus?: SponsorPackageRequestSyncStatus;
  } = {},
) {
  const normalized = normalizeSponsorPackageRequestForm(form);
  const capturedAt = new Date().toISOString();
  const record: SponsorPackageRequestRecord = {
    ...normalized,
    capturedAt,
    id: `sponsor-package-${globalThis.crypto.randomUUID()}`,
    persistence: options.persistence ?? 'local-preview',
    sourcePath: getSponsorPackageRequestSourcePath(),
    syncStatus: options.syncStatus ?? 'backend-pending',
  };
  const queue = readSponsorPackageRequestQueue();
  if (queue.length >= MAX_SAVED_REQUESTS) {
    const completedIndex = queue.findIndex((entry) => entry.syncStatus === 'backend-synced');
    if (completedIndex < 0) {
      throw new Error('SPONSOR_PACKAGE_DRAFT_STORAGE_FULL');
    }
    queue.splice(completedIndex, 1);
  }
  const nextQueue = [...queue, record];

  writeSponsorPackageRequestQueue(nextQueue);

  return {
    queueCount: nextQueue.length,
    record,
  };
}

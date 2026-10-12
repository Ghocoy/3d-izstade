import assert from 'node:assert/strict';
import {
  buildSponsorPackageLeadPayload,
  getSponsorPackageInterestLabel,
  getSponsorPackageRequestFailure,
  getPendingSponsorPackageRequestQueue,
  INITIAL_SPONSOR_PACKAGE_REQUEST_FORM,
  normalizeSponsorPackageRequestForm,
  readSponsorPackageRequestQueue,
  SPONSOR_PACKAGE_REQUEST_STORAGE_KEY,
  saveSponsorPackageRequest,
  syncPendingSponsorPackageRequests,
  validateSponsorPackageRequestForm,
  type SponsorPackageRequestForm,
} from './sponsorPackageRequest';
import { ExpoDataAPI } from '../../services/expo';

const validForm: SponsorPackageRequestForm = {
  ...INITIAL_SPONSOR_PACKAGE_REQUEST_FORM,
  budgetRange: ' 10k-25k ',
  ctaLabel: ' Request demo ',
  company: ' Warpala Sponsor ',
  email: ' buyer@example.com ',
  logoUrl: ' https://cdn.example.com/logo.webp ',
  mediaUrl: ' https://cdn.example.com/screen.webp ',
  message: ' Interested in Premium Booth and Demo Arena sponsorship. ',
  name: ' Sponsor Buyer ',
  packageInterest: 'premium',
  phone: ' +371 20000000 ',
  sponsorHeadline: ' Launch-ready Web3D sponsor booth ',
  timeline: ' next-month ',
  website: ' https://example.com ',
};

assert.deepEqual(normalizeSponsorPackageRequestForm(validForm), {
  budgetRange: '10k-25k',
  ctaLabel: 'Request demo',
  company: 'Warpala Sponsor',
  email: 'buyer@example.com',
  logoUrl: 'https://cdn.example.com/logo.webp',
  mediaUrl: 'https://cdn.example.com/screen.webp',
  message: 'Interested in Premium Booth and Demo Arena sponsorship.',
  name: 'Sponsor Buyer',
  packageInterest: 'premium',
  phone: '+371 20000000',
  sponsorHeadline: 'Launch-ready Web3D sponsor booth',
  timeline: 'next-month',
  website: 'https://example.com',
});

assert.equal(validateSponsorPackageRequestForm(validForm), null);
assert.equal(validateSponsorPackageRequestForm({ ...validForm, email: 'bad-email' }), 'Enter a valid work email.');
assert.equal(validateSponsorPackageRequestForm({ ...validForm, company: '' }), 'Enter a company name.');
assert.equal(validateSponsorPackageRequestForm({ ...validForm, logoUrl: 'http://cdn.example.com/logo.webp' }), 'Use a public HTTPS logo URL or leave it blank.');
assert.equal(validateSponsorPackageRequestForm({ ...validForm, mediaUrl: 'not-a-url' }), 'Use a public HTTPS media URL or leave it blank.');
assert.equal(getSponsorPackageInterestLabel('arena'), 'Demo Arena Sponsor');
assert.equal(getSponsorPackageInterestLabel('unsure'), 'Not sure yet');

const payload = buildSponsorPackageLeadPayload(validForm, '/expo/sponsor-packages?source=test');

assert.equal(payload.clientEmail, 'buyer@example.com');
assert.equal(payload.clientName, 'Sponsor Buyer');
assert.equal(payload.companyId, 'sponsor-concierge');
assert.equal(payload.companySlug, 'sponsor-concierge');
assert.equal(payload.sourcePath, '/expo/sponsor-packages?source=test');
assert.match(payload.message, /Sponsor package interest: Premium Booth/);
assert.match(payload.message, /Sponsor company: Warpala Sponsor/);
assert.match(payload.message, /Contact phone: \+371 20000000/);
assert.match(payload.message, /Website: https:\/\/example\.com/);
assert.match(payload.message, /Logo URL: https:\/\/cdn\.example\.com\/logo\.webp/);
assert.match(payload.message, /Media URL: https:\/\/cdn\.example\.com\/screen\.webp/);
assert.match(payload.message, /Booth headline: Launch-ready Web3D sponsor booth/);
assert.match(payload.message, /Preferred CTA: Request demo/);
assert.match(payload.message, /Interested in Premium Booth and Demo Arena sponsorship\./);

const originalWindow = globalThis.window;
const storage: Record<string, string> = {};

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
    },
    location: {
      pathname: '/expo/sponsor-packages',
      search: '?source=test',
    },
  },
});

const result = saveSponsorPackageRequest(validForm);

assert.equal(result.queueCount, 1);
assert.equal(result.record.company, 'Warpala Sponsor');
assert.equal(result.record.persistence, 'local-preview');
assert.equal(result.record.syncStatus, 'backend-pending');
assert.equal(result.record.sourcePath, '/expo/sponsor-packages?source=test');

const syncedResult = saveSponsorPackageRequest(validForm, {
  persistence: 'backend',
  syncStatus: 'backend-synced',
});

assert.equal(syncedResult.queueCount, 2);
assert.equal(syncedResult.record.persistence, 'backend');
assert.equal(syncedResult.record.syncStatus, 'backend-synced');
assert.equal(getPendingSponsorPackageRequestQueue().length, 1);

const originalCreateExpoLead = ExpoDataAPI.createExpoLead;
const capturedLeadPayloads: unknown[] = [];
ExpoDataAPI.createExpoLead = async (leadPayload: unknown) => {
  capturedLeadPayloads.push(leadPayload);
  return { success: true };
};

const syncResult = await syncPendingSponsorPackageRequests();

assert.equal(syncResult.syncedCount, 1);
assert.equal(syncResult.failedCount, 0);
assert.equal(syncResult.pendingCount, 0);
assert.equal(syncResult.queueCount, 2);
assert.equal(capturedLeadPayloads.length, 1);
assert.match(JSON.stringify(capturedLeadPayloads[0]), /Sponsor package interest: Premium Booth/);
assert.equal(getPendingSponsorPackageRequestQueue().length, 0);

// Invalid and duplicate requests must not be queued as network failures.
assert.equal(getSponsorPackageRequestFailure(new Error('SERVER_API_HTTP_400: EXPO_LEAD_INVALID')).retryable, false);
assert.equal(getSponsorPackageRequestFailure(new Error('SERVER_API_HTTP_403: FORBIDDEN')).retryable, false);
assert.equal(getSponsorPackageRequestFailure(new Error('SERVER_API_HTTP_409: EXPO_LEAD_DUPLICATE')).retryable, false);
assert.equal(getSponsorPackageRequestFailure(new Error('SERVER_API_HTTP_429: EXPO_LEAD_RATE_LIMITED')).retryable, true);
assert.equal(getSponsorPackageRequestFailure(new Error('SERVER_API_HTTP_503: UNAVAILABLE')).retryable, true);
assert.equal(getSponsorPackageRequestFailure(new TypeError('Failed to fetch')).retryable, true);

// Two captures at exactly the same timestamp must keep independent identities.
const originalToISOString = Date.prototype.toISOString;
Date.prototype.toISOString = () => '2026-10-12T19:00:00.000Z';
try {
  const first = saveSponsorPackageRequest(validForm).record;
  const second = saveSponsorPackageRequest(validForm).record;
  assert.equal(first.capturedAt, second.capturedAt);
  assert.notEqual(first.id, second.id);
} finally {
  Date.prototype.toISOString = originalToISOString;
}

// Reading a full queue must preserve all 50 requests. Unsent drafts are never evicted.
const fullQueue = Array.from({ length: 50 }, (_, index) => ({ ...result.record, id: `pending-${index}` }));
storage[SPONSOR_PACKAGE_REQUEST_STORAGE_KEY] = JSON.stringify(fullQueue);
assert.equal(readSponsorPackageRequestQueue().length, 50);
assert.throws(() => saveSponsorPackageRequest(validForm), /SPONSOR_PACKAGE_DRAFT_STORAGE_FULL/);
assert.deepEqual(readSponsorPackageRequestQueue(), fullQueue);
fullQueue[12] = { ...fullQueue[12], persistence: 'backend', syncStatus: 'backend-synced' };
storage[SPONSOR_PACKAGE_REQUEST_STORAGE_KEY] = JSON.stringify(fullQueue);
saveSponsorPackageRequest(validForm);
assert.equal(readSponsorPackageRequestQueue().length, 50);
assert.equal(readSponsorPackageRequestQueue()[0].id, 'pending-0');
assert.equal(readSponsorPackageRequestQueue().some(record => record.id === 'pending-12'), false);

// A draft captured during a slow sync survives the completed network request.
storage[SPONSOR_PACKAGE_REQUEST_STORAGE_KEY] = JSON.stringify([result.record]);
let completeRequest!: (value: { success: boolean }) => void;
ExpoDataAPI.createExpoLead = async () => await new Promise(resolve => { completeRequest = resolve; });
const pendingSync = syncPendingSponsorPackageRequests();
const concurrentDraft = saveSponsorPackageRequest({ ...validForm, email: 'second@example.com' }).record;
completeRequest({ success: true });
const concurrentResult = await pendingSync;
assert.equal(concurrentResult.syncedCount, 1);
assert.equal(concurrentResult.pendingCount, 1);
assert.equal(readSponsorPackageRequestQueue().length, 2);
assert.equal(getPendingSponsorPackageRequestQueue()[0].id, concurrentDraft.id);

// A rejected saved request stays available for review rather than being marked sent.
ExpoDataAPI.createExpoLead = async () => { throw new Error('SERVER_API_HTTP_400: EXPO_LEAD_INVALID'); };
const rejectedSync = await syncPendingSponsorPackageRequests();
assert.equal(rejectedSync.failedCount, 1);
assert.equal(rejectedSync.pendingCount, 1);

ExpoDataAPI.createExpoLead = originalCreateExpoLead;

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: originalWindow,
});

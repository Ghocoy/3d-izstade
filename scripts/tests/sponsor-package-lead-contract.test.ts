import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { buildSponsorPackageLeadPayload, INITIAL_SPONSOR_PACKAGE_REQUEST_FORM } from '../../src/app/expo/sponsorPackageRequest';
import { parseSponsorPackageLeadMessage } from '../../src/app/expo/sponsorPackageLead';
import { captureExpoLeadWithDependencies } from '../../backend-server/controllers/expoLeadController.js';

const currentCompanyId = 'f983b4dd-5459-472c-98a3-0fffd33bf2a9';
const insertedRows: Array<Record<string, unknown>> = [];
const payload = buildSponsorPackageLeadPayload({
  ...INITIAL_SPONSOR_PACKAGE_REQUEST_FORM,
  company: 'Synthetic contract sponsor', email: 'qa@example.invalid', name: 'QA Buyer',
  message: 'Show our launch in a premium booth.', budgetRange: 'EUR 5k-15k', timeline: 'Next month',
}, '/expo/sponsor-packages?source=contract-test');
const result = { statusCode: 200, body: null as unknown };
const response = {
  status(code: number) { result.statusCode = code; return response; },
  json(body: unknown) { result.body = body; return response; },
} as Response;
const database = {
  from(table: string) {
    if (table === 'companies') return {
      select(columns: string) {
        assert.equal(columns, 'id');
        return { eq(column: string, value: string) {
          assert.equal(column, 'slug'); assert.equal(value, 'sponsor-concierge');
          return { async maybeSingle() { return { data: { id: currentCompanyId }, error: null }; } };
        } };
      },
    };
    assert.equal(table, 'service_requests');
    return { async insert(rows: Array<Record<string, unknown>>) { insertedRows.push(...rows);return { error: null }; } };
  },
};
await captureExpoLeadWithDependencies({ body: payload } as Request, response, {
  audit: () => undefined,
  config: {
    duplicateWindowMs: 30 * 60 * 1000,
    rateLimit: { maxRequests: { calculator: 5, expo: 5 }, requireRedis: false, windowMs: 600_000 },
    turnstile: { required: false, secretKey: null, timeoutMs: 5_000 },
  },
  duplicateLookup: async () => null,
  rateLimitStore: { async increment(_key, windowMs, nowMs) { return { count: 1, resetAt: nowMs + windowMs }; } },
  supabase: database as never,
});
assert.equal(result.statusCode, 201);
assert.deepEqual(result.body, { success: true, companyId: currentCompanyId, companySlug: 'sponsor-concierge', sourcePath: payload.sourcePath });
assert.equal(insertedRows.length, 1);
assert.equal(insertedRows[0].company_id, currentCompanyId);
assert.equal(insertedRows[0].service_name, 'expo_sponsor_lead:sponsor-concierge');
const inboxDetails = parseSponsorPackageLeadMessage(insertedRows[0].message as string);
assert.equal(inboxDetails?.company, 'Synthetic contract sponsor');
assert.equal(inboxDetails?.packageInterest, 'Premium Booth');
assert.equal(inboxDetails?.budgetSignal, 'EUR 5k-15k');
assert.equal(inboxDetails?.timeline, 'Next month');
assert.equal(inboxDetails?.message, 'Show our launch in a premium booth.');

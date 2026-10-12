FREE DEMO INFRASTRUCTURE

LOCAL HOSTING OPTION — 2026-10-12
The user confirmed the PC can remain powered on. A separate API/Redis Compose
configuration is prepared in docker-compose.local-host.yml; setup and named/
temporary Cloudflare tunnel options are in local-host/README.txt. This avoids
the currently billing-suspended Render workspace. Supabase remains the new
verified Free project below. The PC API is now live locally and reads the new
Supabase scene correctly. Redis-required limiter, CORS and anonymous quote-admin
checks passed. The tunnel and Pages are not public yet; Cloudflare access/DNS and
complete frontend/live validation remain outstanding. The Render blueprint below
is an alternative if its account becomes usable; no new Render resource exists.

Source: https://github.com/Ghocoy/3d-izstade
Deployment branch: infra/free-stack-20261012 (based on release/v1-stabilization)
Frontend: existing root Vite SPA, Cloudflare Pages Free
Database/Auth/Storage: a new Supabase Free project
API: backend-server/Dockerfile.full, this PC through Cloudflare Tunnel
Redis: Docker on this PC, internal network with a persistent local volume
Render Free blueprint is an unused alternative; its workspace is billing-suspended.

CURRENT CLOUD STATUS — 2026-10-12
Supabase ghocoy-expo-free was CREATED in the named organization after the provider
confirmed cost 0/month. Ref: fnvifghuszodpjtzemiw, EU Central (Frankfurt).
Dashboard: https://supabase.com/dashboard/project/fnvifghuszodpjtzemiw
The schema is applied and verified: 67 public tables, all RLS enabled; private
quotes have no anon/authenticated SELECT grant; service-role inserts are allowed.
Two Storage buckets exist (expo_assets public, expo_review_media private).
Trigger function search_path warnings were fixed and the security advisor now
shows only informational default-deny/no-policy findings for server-only tables.
Public browser configuration is saved locally in ignored
.tmp/free-stack-supabase-public.env. User entered the server secret locally into
ignored .tmp/local-host/backend.env; it was not printed or published.

The new project's three ACTUAL remote migration versions are mirrored under
deployment/free-stack/supabase/migrations with their original applied SQL.
Use deployment/free-stack as the CLI workdir for this new project. Do not replay
the historical root migration tree against the already bootstrapped project.
The follow-up expo_free_seed_city_scope connects the two release seed sectors
to Warpala Prime; they were created after the historical city backfill and the
default scene previously filtered out their three companies/booths. The future
guarded bootstrap includes this fix and CI checks city-scoped sponsors.

User confirmed an existing Cloudflare account, but no management connection is
available in this session. Render's five existing workspace services all report
suspended / billing, including a Free service; no new Render resources were
created. Existing services, disks, invoices and Supabase projects are unchanged.
The chosen PC API is verified locally; Cloudflare Pages/tunnel setup and actual
public frontend validation remain before a working public demo. This does not remove
existing account charges. No payment or paid-plan change was performed.

Do not select a paid service plan, enable paid previews or add live AI/Stripe keys.
Render Free sleeps on idle and has no uptime guarantee. Its free Redis is memory
only; permanent records belong in Supabase. This stack is a controlled demo/beta.

1. DATABASE

Run node scripts/prepare-fresh-supabase.mjs to prepare the SQL bundle.
The generated .tmp/free-stack-bootstrap/bootstrap.sql refuses to run against an
existing app database. Apply it in one transaction ONLY to the new project after
the isolated CI database test passes. It preserves the ordered historical SQL
and adds fresh-project compatibility, explicit grants, RLS and function hardening.
Never run a linked db reset against another project.

Check the actual new project with SQL/advisors after applying the bundle.
The CI platform fixture file is not part of the deployed SQL and must never be
executed against hosted Supabase.

Set Auth Site URL to the actual https://PROJECT.pages.dev address; allow only the
needed login/reset callbacks. Keep email confirmation policy explicit. Supabase's
built-in test mailer is not a public signup mail service; use approved test users
for the initial demo or configure an SMTP provider before opening signup broadly.
Create the operator user and assign app_metadata.role=admin through server/admin
tools. Do not trust user_metadata or expose any server secret in frontend env.

2. API AND REDIS

The selected PC hosting setup is in local-host/README.txt. Its local health,
new-project scene and Redis-required limiter passed runtime checks. Secure
server-key entry is complete. Cloudflare connection/tunnel and frontend checks
remain. The following Render instructions describe the unused alternative.

render.yaml describes exactly two free resources, no persistent disk/worker/GPU.
Render must have GitHub repository access. Use the deployment branch above and
the root build context with backend-server/Dockerfile.full.

Use the new Supabase URL and publishable key. SUPABASE_SERVICE_KEY is the new
server-side key and must be entered only into Render secret settings. The current
Supabase connector can retrieve publishable keys, but does not expose server keys.
Use the Redis internal connection URL and set the API's CORS origins to the actual
Pages URL. The quote production host allowlist needs both Pages and API hostnames.
Examples are in backend.env.example. Disable automatic deploys until verification.

3. FRONTEND

Cloudflare account connection is required. Connect the GitHub repo in Pages,
select the deployment branch, and use:
  Framework preset: Vite (or None with the commands below)
  Build command: npm run build:cloudflare
  Build output directory: dist
  Node version: 24

Set the four real public VITE_* values in frontend.env.example before building.
The build fails if they are absent instead of silently consuming old local .env.
It prepares a separate compact public directory, compresses large GLBs and
converts the street EXR to a linear 1k HDR environment. Original public/ assets
and normal Vercel/local builds are preserved. The Pages build rewrites only the
street environment URL during compilation and enforces 25 MiB/file and file count.
Pages handles SPA routes when no top-level 404.html is present.

4. VALIDATION BEFORE USING THE DEMO

GitHub workflow Free Infrastructure Validation builds the compact frontend,
checks bundle/static contracts, builds/tests the backend, and validates a fresh
SQL bootstrap against PostgreSQL 17 with isolated Supabase platform fixtures.
CI uses non-deployment build fixtures; those URLs/keys must never be published
as a working demo configuration.

After setting real provider configuration, verify API /health and /api/expo/scene,
Redis availability, CORS, login, private/admin authorization, sponsor upload/review,
lead persistence, quote submit/admin access and browser/mobile behavior. Allow
the API time to resume from sleep; do not interpret a fallback city as DB health.
Live deployment and provider access still need verification beyond isolated CI.

Preparation evidence (2026-10-12): the full 46-migration SQL bundle applied in
one transaction on an isolated local PostgreSQL 18.3 cluster with platform test
fixtures. It created 67 public tables, 5 sectors, 3 companies and 3 booths.
RLS/private quote grants, public scene reads and Auth user trigger assertions
passed; the existing-database guard rejected that initialized test DB as intended.
This does not substitute for hosted Supabase Auth/Storage integration testing.
The actual street EXR converted and decoded successfully as a 1024x512 HDR,
2,117,682 bytes. GLB/native Sharp compression and full frontend build still need
a complete dependency installation. The GitHub run 38264989101 failed before
either job started any steps; its precise scheduling/account error is unverified.

Known local-machine blocker: recovered Vite/Supabase/native Sharp installations
are incomplete and this sandbox cannot access npm's network. No original
node_modules were removed. GitHub/Cloudflare/Render installs from the lockfiles
in their Linux build environments; local npm ci can be run outside this sandbox
later to repair this computer's dependencies.

Official references:
https://developers.cloudflare.com/pages/platform/limits/
https://render.com/docs/free
https://render.com/docs/key-value
https://supabase.com/pricing

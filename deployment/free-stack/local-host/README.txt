LOCAL API + REDIS, CLOUDFLARE PAGES FRONTEND, SUPABASE FREE

This is the prepared alternative to the billing-suspended Render workspace.
It reuses backend-server/Dockerfile.full and the new Supabase project
fnvifghuszodpjtzemiw. The public API has not been started or deployed yet.
No Hetzner, Vercel or Render hosting subscription is needed for this topology.
Supabase/Pages free quotas still apply; electricity, internet and an existing
domain's renewal are separate costs. The API needs the PC awake and online.

EXISTING DOMAIN — observed 2026-10-12
User confirms ownership of www.30sek24.com. DNS observations are saved in
domain-observations.json. www has CNAME d363026e05356794.vercel-dns-017.com;
apex A is 216.198.79.1; api and api-staging A are 138.199.214.208; staging A is
76.76.21.21. Authoritative NS are dns1..dns4.p02.nsone.net. SOA references
Netlify, suggesting its DNS infrastructure; the registrar is still unverified.
The domain currently does not use Cloudflare nameservers. An existing Cloudflare
account does not by itself mean this zone is active there.
The web reader exposes cached title Warpala OS, but no rendered SPA body; API
health/scene requests were inaccessible to the tool. Live browser behavior and
the deployed version are unverified. No DNS or existing host setting was changed.

For the Free named-tunnel path, first export the FULL current DNS zone from its
provider, add 30sek24.com to Cloudflare Free and check all imported records.
The public observation snapshot is not a full-zone backup. Preserve the current
www/apex/staging/API destinations while preparing the PC backend; for existing
Vercel frontend records initially use DNS-only. Check DNSSEC/DS settings with the
registrar before switching nameservers. The registrar and Cloudflare account
access are required, and no nameserver migration has been performed here.

Use api-pc.30sek24.com as a proposed separate validation hostname. It is not
created yet. Configure the named tunnel's route to HTTP backend:3000 and verify
it before changing existing api.30sek24.com or www.30sek24.com. The local env
examples now use this proposed API, the known www origin and the new Supabase.
For a Pages preview add its ACTUAL origin/hostname to backend allowlists and use
that preview URL as VITE_PUBLIC_APP_URL/Auth callbacks until the frontend is ready.
Then reconcile the final frontend/API URLs and move the public records only
after the build, public health, CORS, Auth and application checks pass.

PREREQUISITES
- Start Docker Desktop in Linux-container mode. It is installed on this PC,
  but its engine was not running at the last check.
- Docker must be able to download images and npm dependencies. The current
  agent sandbox cannot reach npm; a complete Docker build remains unverified.
- In the repository root create .tmp/local-host. Copy backend.env.example to
  .tmp/local-host/backend.env. Replace every placeholder with actual values.
- The new public Supabase settings are already saved in the ignored file
  .tmp/free-stack-supabase-public.env. Enter the server key from the new project's
  Dashboard locally, only in backend.env. Do not use old project keys.
- Keep only real frontend origins/hostnames in the CORS and quote allowlists.
  For local frontend testing, explicitly add http://localhost:5173 and localhost.

LOCAL VERIFICATION FIRST (commands run from repository root)
Recommended interactive helper (run in your own PowerShell terminal):
pwsh -File .\scripts\start-local-expo.ps1
This checks the Docker engine, requests the NEW Supabase server key as hidden
local input if absent, builds the backend and starts only this Compose project's
API/Redis, then checks local health/scene HTTP responses. Existing Docker projects
are not stopped. It prints no credential values. It has not been run to completion
because Docker engine access and secure key entry are still pending.
The ignored .tmp/local-host/backend.env is already prepared with the new project's
actual public settings and an EMPTY server-key field. Do not publish that file.

Manual equivalents:
docker compose --env-file .tmp/local-host/backend.env -f docker-compose.local-host.yml config --quiet
docker compose --env-file .tmp/local-host/backend.env -f docker-compose.local-host.yml up -d --build backend redis
docker compose --env-file .tmp/local-host/backend.env -f docker-compose.local-host.yml ps
curl.exe --fail http://127.0.0.1:3000/health
curl.exe --fail http://127.0.0.1:3000/api/expo/scene

Redis has no host/public port, uses an isolated internal network and persists to
the project-specific redis-data volume. Backend port 3000 is bound to loopback.
This uses its own Compose project and does not replace the old warpala network.
Do not use down --volumes for routine stops. Permanent business records stay
in Supabase; the Redis volume is not a database backup.

OPTION A: STABLE NAMED TUNNEL (recommended when a domain exists)
- Put the existing domain's DNS zone on Cloudflare if needed.
- In Cloudflare Dashboard > Networking > Tunnels create ghocoy-expo-local.
- Save only the tunnel token into .tmp/local-host/tunnel-token, as a plain text
  file readable by cloudflared. The token file is ignored by Git. Keep it private.
- Configure its published application hostname api.YOUR-DOMAIN, service HTTP,
  URL backend:3000. Inside this Docker container localhost is not the backend.
- Run:
pwsh -File .\scripts\start-local-expo.ps1 -Mode NamedTunnel -SkipBuild
This reuses the previously verified backend build and requests the tunnel token
locally if absent. Use SkipBuild only after the local build has succeeded.
Manual equivalent:
docker compose --env-file .tmp/local-host/backend.env -f docker-compose.local-host.yml --profile named-tunnel up -d tunnel
- Check the tunnel is Healthy, then verify the public /health and scene paths.
  Do not use a private email-access gate on an API needed by public visitors.
- Set frontend VITE_PUBLIC_API_BASE_URL to https://api.YOUR-DOMAIN, configure
  real Pages/Supabase public settings, deploy Pages and set Auth callbacks.

OPTION B: QUICK TUNNEL (temporary testing without a domain)
docker compose --env-file .tmp/local-host/backend.env -f docker-compose.local-host.yml --profile quick-tunnel up -d quick-tunnel
docker compose --env-file .tmp/local-host/backend.env -f docker-compose.local-host.yml logs quick-tunnel
- Take the printed https://....trycloudflare.com address. Add its hostname to
  MODULAR_HOME_QUOTE_PRODUCTION_HOSTS, recreate backend with the same up command,
  and use that URL in the frontend configuration/rebuild.
- This URL changes when a new Quick Tunnel is created, so another frontend build
  and allowlist update will then be needed. No uptime guarantee or SSE support;
  maximum 200 concurrent in-flight requests. Use this for tests, not a stable link.
- Do not start both tunnel profiles for ordinary use.

AVAILABILITY AND REMAINING WORK
Set Docker Desktop to start when you sign in if continuous hosting is chosen.
Keep the PC awake while plugged in; turning the display off is fine. Compose
restart policies restart the named tunnel/API/Redis when the engine returns,
but do not start Docker Desktop before Windows login. No Windows service,
scheduled task or power setting has been changed by this preparation.
If the PC/internet goes down, Pages can still load but API features stop.
Complete the full build, Auth/Storage/CORS/private-route/lead/quote checks before
opening this to visitors. Paid AI, Stripe and GPU streaming are not configured.

Official references:
https://developers.cloudflare.com/tunnel/get-started/
https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
https://developers.cloudflare.com/tunnel/reference/run-parameters/

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareCloudflarePublic } from './compact-cloudflare-assets.mjs';

const required = ['VITE_PUBLIC_API_BASE_URL', 'VITE_PUBLIC_APP_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
for (const key of required) {
  if (!process.env[key]?.trim()) throw new Error(`Set ${key} in Cloudflare Pages build settings. Old local .env files are not used for this deployment.`);
}
if (!process.env.npm_execpath) throw new Error('Run this build through npm run build:cloudflare');
const temporaryRoot = path.resolve('.tmp');
await fs.mkdir(temporaryRoot, { recursive: true });
const publicDirectory = await fs.mkdtemp(path.join(temporaryRoot, 'cloudflare-public-'));
console.log('[cloudflare] Preparing compact assets without changing public source files');
const assets = await prepareCloudflarePublic('public', publicDirectory);
console.log(`[cloudflare] Compacted ${assets.compactedModels.length} models; generated 1k HDR environment`);
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
  stdio: 'inherit', windowsHide: true,
  env: {
    ...process.env,
    WARPALA_SKIP_ENV_FILE_LOAD: '1',
    WARPALA_PUBLIC_DIR: publicDirectory,
    WARPALA_COMPACT_ASSETS: '1',
    VITE_ENABLE_DEMO: 'false', VITE_ENABLE_3D_QA: 'false',
    VITE_SIGNALING_SERVER_URL: '', VITE_TURN_USERNAME: '', VITE_TURN_PASSWORD: '',
    VITE_STUN_SERVER_URLS: '', VITE_TURN_SERVER_URLS: '',
  },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
let count = 0;
async function verify(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await verify(file);
    else if (entry.isFile()) {
      count += 1;
      if ((await fs.stat(file)).size > 25 * 1024 * 1024) throw new Error(`Pages file exceeds 25 MiB: ${file}`);
    }
  }
}
await verify(path.resolve('dist'));
if (count > 20000) throw new Error(`Pages Free file count exceeded: ${count}`);
// Pages provides SPA routing automatically when there is no top-level 404.html.
await fs.writeFile('dist/_headers', '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n');
console.log(`[cloudflare] Ready: ${count} files, every file within Pages limits`);

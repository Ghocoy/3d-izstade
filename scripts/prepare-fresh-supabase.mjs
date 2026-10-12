import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const output = path.resolve('.tmp/free-stack-bootstrap');
const migrationRoot = path.join(root, 'supabase/migrations');
const files = (await fs.readdir(migrationRoot)).filter(name => /^\d{14}_.+\.sql$/.test(name) || name === '20260318_production_setup.sql');
const version = name => name.startsWith('20260318_') ? '20260318000000' : name.slice(0, 14);
files.sort((a, b) => version(a).localeCompare(version(b)));
if (new Set(files.map(version)).size !== files.length) throw new Error('Duplicate migration versions');
const guard = `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN ('companies', 'users', 'booths', 'modular_home_quote_requests')) THEN
    RAISE EXCEPTION 'FRESH_PROJECT_REQUIRED: refusing to bootstrap an existing application database';
  END IF;
END $$;\n`;
const parts = [guard];
const manifest = [];
for (const name of files) {
  const sql = await fs.readFile(path.join(migrationRoot, name), 'utf8');
  parts.push(`\n-- SOURCE: ${name}\n${sql}\n`);
  manifest.push({ name, version: version(name), sha256: createHash('sha256').update(sql).digest('hex') });
}
parts.push(await fs.readFile('supabase/bootstrap/fresh-project-compat.sql', 'utf8'));
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'bootstrap.sql'), parts.join('\n'));
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`[fresh-supabase] Prepared ${files.length} ordered migrations + fresh-project compatibility, with existing-project guard`);
console.log('[fresh-supabase] SQL prepared only; no database connection or schema change');

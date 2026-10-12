import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import createIgnore from 'ignore';

const SECRET_ENV_CANDIDATES = [
  '.tmp/local-host/backend.env',
  '.tmp/local-host/tunnel-token',
  '.tmp/free-stack-supabase-public.env',
  '.env',
  '.env.local',
  '.env.docker',
  '.env.production',
  '.env.staging',
  'backend-server/.env',
  'backend-server/.env.local',
  'backend-server/.env.production',
  'backend-server/.env.staging',
];

const REQUIRED_ENV_EXAMPLES = [
  '.env.example',
  '.env.docker.example',
  'backend-server/.env.example',
];

const REQUIRED_IGNORED_LOCAL_ARTIFACTS = [
  'backend-server/dist/server.js',
  'backend-server/__tests__/runtimeEnv.test.ts',
  'backend-server/routes/__tests__/expoScene.test.ts',
  'backend-server/worker-smoke.log',
  'backend-server/worker-smoke.err.log',
];

const REQUIRED_BACKEND_DOCKER_INPUTS = [
  'backend-server/env.ts',
  'backend-server/server.ts',
  'backend-server/worker.ts',
  'backend-server/types.d.ts',
  'backend-server/tsconfig.json',
  'backend-server/config',
  'backend-server/controllers',
  'backend-server/events',
  'backend-server/lib',
  'backend-server/middleware',
  'backend-server/observability',
  'backend-server/routes/api.ts',
  'backend-server/routes/landing.ts',
  'backend-server/schemas',
  'backend-server/services',
  'src',
  'docs/booth-slot-bank.json',
];

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function readRequired(rootDirectory, relativePath) {
  const absolutePath = path.join(rootDirectory, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`[check-docker-secret-hygiene] missing ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function collectActualTopLevelEnvFiles(rootDirectory) {
  const envFiles = [];
  for (const relativeDirectory of ['', 'backend-server']) {
    const absoluteDirectory = path.join(rootDirectory, relativeDirectory);
    if (!fs.existsSync(absoluteDirectory)) {
      continue;
    }

    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith('.env')) {
        continue;
      }
      if (entry.name.endsWith('.example')) {
        continue;
      }
      envFiles.push(normalizePath(path.join(relativeDirectory, entry.name)));
    }
  }
  return envFiles.sort();
}

function backendBuilderCopyLines(dockerfile) {
  return dockerfile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('COPY ') && !line.startsWith('COPY --from=builder'));
}

function hasCopySource(copyLines, relativePath) {
  return copyLines.some((line) => line.includes(relativePath));
}

export function verifyDockerSecretHygiene(rootDirectory = process.cwd()) {
  const failures = [];
  const dockerIgnore = createIgnore().add(readRequired(rootDirectory, '.dockerignore'));
  const backendDockerfile = readRequired(rootDirectory, 'backend-server/Dockerfile.full');
  const copyLines = backendBuilderCopyLines(backendDockerfile);
  const actualEnvFiles = collectActualTopLevelEnvFiles(rootDirectory);

  for (const relativePath of SECRET_ENV_CANDIDATES) {
    if (!dockerIgnore.ignores(relativePath)) {
      failures.push(`.dockerignore does not exclude secret env candidate: ${relativePath}.`);
    }
  }

  for (const relativePath of actualEnvFiles) {
    if (!dockerIgnore.ignores(relativePath)) {
      failures.push(`Local env file would enter the Docker context: ${relativePath}.`);
    }
  }

  for (const relativePath of REQUIRED_ENV_EXAMPLES) {
    const absolutePath = path.join(rootDirectory, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      failures.push(`Required env example is missing: ${relativePath}.`);
    } else if (dockerIgnore.ignores(relativePath)) {
      failures.push(`Env example must remain available in Docker context: ${relativePath}.`);
    }
  }

  for (const relativePath of REQUIRED_IGNORED_LOCAL_ARTIFACTS) {
    if (!dockerIgnore.ignores(relativePath)) {
      failures.push(`Local backend artifact is not excluded from Docker context: ${relativePath}.`);
    }
  }

  if (/^COPY\s+backend-server\s+\.\/backend-server\/?$/m.test(backendDockerfile)
    || /COPY\s+\[\s*["']backend-server["']\s*,\s*["']\.\/backend-server\/?["']\s*\]/m.test(backendDockerfile)) {
    failures.push('backend-server/Dockerfile.full still copies the whole backend-server directory.');
  }

  for (const forbiddenCopySource of [
    'backend-server/.env',
    'backend-server/__tests__',
    'backend-server/routes/__tests__',
    'backend-server/*.log',
  ]) {
    if (hasCopySource(copyLines, forbiddenCopySource)) {
      failures.push(`backend-server/Dockerfile.full copies a local-only backend path: ${forbiddenCopySource}.`);
    }
  }

  for (const relativePath of REQUIRED_BACKEND_DOCKER_INPUTS) {
    if (!hasCopySource(copyLines, relativePath)) {
      failures.push(`backend-server/Dockerfile.full does not copy required build input: ${relativePath}.`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `[check-docker-secret-hygiene] failed\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
    );
  }

  return {
    actualEnvFilesExcluded: actualEnvFiles.length,
    backendDockerInputs: REQUIRED_BACKEND_DOCKER_INPUTS.length,
    envExamplesAllowed: REQUIRED_ENV_EXAMPLES.length,
    ignoredLocalArtifacts: REQUIRED_IGNORED_LOCAL_ARTIFACTS.length,
    secretEnvPatterns: SECRET_ENV_CANDIDATES.length,
  };
}

export function printDockerSecretHygieneReport(report) {
  console.log('[check-docker-secret-hygiene] passed');
  console.log(`- Secret env candidates excluded: ${report.secretEnvPatterns}.`);
  console.log(`- Actual local env files excluded: ${report.actualEnvFilesExcluded}.`);
  console.log(`- Env examples available in context: ${report.envExamplesAllowed}.`);
  console.log(`- Local backend artifacts excluded: ${report.ignoredLocalArtifacts}.`);
  console.log(`- Backend Docker build inputs copied explicitly: ${report.backendDockerInputs}.`);
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    printDockerSecretHygieneReport(verifyDockerSecretHygiene());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { FloatType } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import yaml from 'js-yaml';
import { encodeRadianceHdr, prepareCloudflarePublic } from '../compact-cloudflare-assets.mjs';

test('Compact HDR retains highlight values above 1 and channel ordering', () => {
  const data = new Float32Array(8 * 2 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([0.5, 1, 8, 1], i);
  const encoded = encodeRadianceHdr(data, 8, 2);
  const decoded = new HDRLoader().setDataType(FloatType).parse(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength));
  assert.equal(decoded.width, 8);
  assert.equal(decoded.height, 2);
  for (let i = 0; i < decoded.data.length; i += 4) {
    assert.ok(Math.abs(decoded.data[i] - 0.5) < 0.04);
    assert.ok(Math.abs(decoded.data[i + 1] - 1) < 0.04);
    assert.ok(Math.abs(decoded.data[i + 2] - 8) < 0.04);
  }
});

test('Compact asset preparation refuses to overwrite source public files', async () => {
  await assert.rejects(prepareCloudflarePublic('public', 'public/output'), /outside the original public/);
});

test('Render definition has only free services and an internal Redis connection', async () => {
  const blueprint = yaml.load(await fs.readFile('render.yaml', 'utf8'));
  assert.equal(blueprint.previews.generation, 'off');
  assert.equal(blueprint.services.length, 2);
  assert.ok(blueprint.services.every(service => service.plan === 'free'));
  const redis = blueprint.services.find(service => service.type === 'keyvalue');
  assert.deepEqual(redis.ipAllowList, []);
  assert.equal(redis.persistenceMode, 'off');
  const api = blueprint.services.find(service => service.type === 'web');
  const connection = api.envVars.find(variable => variable.key === 'REDIS_URL');
  assert.equal(connection.fromService.name, redis.name);
  assert.equal(connection.fromService.property, 'connectionString');
  assert.equal(api.envVars.find(variable => variable.key === 'SUPABASE_SERVICE_KEY').sync, false);
  assert.ok(!api.envVars.some(variable => /OPENAI_API_KEY|STRIPE_SECRET_KEY/.test(variable.key)));
});

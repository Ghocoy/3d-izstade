import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FloatType } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

export const COMPACT_STREET_ENVIRONMENT = 'textures/expo-runtime/modern-evening-street-1k.hdr';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const OMITTED_SOURCE_ASSETS = new Set([
  'models/modern_evening_street_4k.exr',
  'textures/pergola_walkway_4k.exr',
]);

// Radiance RGBE retains linear HDR values; it is not an 8-bit exposure bake.
export function encodeRadianceHdr(data, width, height, channels = 4) {
  if (width < 8 || width > 32767 || data.length !== width * height * channels) {
    throw new Error('Invalid RGBE input dimensions');
  }
  const chunks = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`)];
  for (let y = 0; y < height; y += 1) {
    const scanline = new Uint8Array(width * 4);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const rgb = [data[i], data[i + 1], data[i + 2]].map(v => Number.isFinite(v) ? Math.max(0, v) : 0);
      const max = Math.max(...rgb);
      if (max < 1e-32) continue;
      const exponent = Math.min(127, Math.ceil(Math.log2(max)));
      const scale = 256 / 2 ** exponent;
      for (let c = 0; c < 3; c += 1) scanline[c * width + x] = Math.min(255, Math.floor(rgb[c] * scale));
      scanline[3 * width + x] = exponent + 128;
    }
    chunks.push(Buffer.from([2, 2, width >> 8, width & 255]));
    // Literal RLE packets are valid Radiance scanlines and avoid decoder-specific shortcuts.
    for (let c = 0; c < 4; c += 1) {
      for (let x = 0; x < width; x += 127) {
        const n = Math.min(127, width - x);
        chunks.push(Buffer.from([n]), Buffer.from(scanline.subarray(c * width + x, c * width + x + n)));
      }
    }
  }
  return Buffer.concat(chunks);
}

async function compactEnvironment(source, target) {
  const bytes = await fs.readFile(source);
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const image = new EXRLoader().setDataType(FloatType).parse(input);
  const width = Math.min(1024, image.width);
  const height = Math.max(1, Math.round(image.height * width / image.width));
  const pixels = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * image.height / height);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * image.height / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * image.width / width);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * image.width / width));
      const output = (y * width + x) * 4;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const inputIndex = (sy * image.width + sx) * 4;
          for (let c = 0; c < 3; c += 1) pixels[output + c] += image.data[inputIndex + c];
        }
      }
      const samples = (x1 - x0) * (y1 - y0);
      for (let c = 0; c < 3; c += 1) pixels[output + c] /= samples;
      pixels[output + 3] = 1;
    }
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, encodeRadianceHdr(pixels, width, height));
}

let modelTools;
async function compactModel(source, target) {
  if (!modelTools) {
    const [{ NodeIO }, { ALL_EXTENSIONS }, functions, { default: sharp }, { default: draco3d }] = await Promise.all([
      import('@gltf-transform/core'), import('@gltf-transform/extensions'),
      import('@gltf-transform/functions'), import('sharp'), import('draco3dgltf'),
    ]);
    sharp.concurrency(1);
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
    modelTools = { io, functions, sharp };
  }
  const { io, functions, sharp } = modelTools;
  const document = await io.read(source);
  await document.transform(
    functions.dedup(), functions.prune(),
    functions.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 90 }),
    functions.draco({ method: 'edgebreaker', quantizePosition: 16 }),
  );
  await io.write(target, document);
  if ((await fs.stat(target)).size > MAX_FILE_BYTES) throw new Error(`Model still exceeds Pages limit: ${path.basename(source)}`);
}

export async function prepareCloudflarePublic(sourceRoot, destinationRoot) {
  const source = path.resolve(sourceRoot);
  const destination = path.resolve(destinationRoot);
  if (destination === source || destination.startsWith(`${source}${path.sep}`)) {
    throw new Error('Asset output must be outside the original public directory');
  }
  const report = { copied: 0, compactedModels: [], omitted: [...OMITTED_SOURCE_ASSETS] };
  async function visit(relative = '') {
    for (const entry of await fs.readdir(path.join(source, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
      if (name === 'textures/expo' || OMITTED_SOURCE_ASSETS.has(name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Symlink in public assets: ${name}`);
      if (entry.isDirectory()) { await visit(name); continue; }
      if (!entry.isFile()) continue;
      const from = path.join(source, name);
      const to = path.join(destination, name);
      await fs.mkdir(path.dirname(to), { recursive: true });
      if ((await fs.stat(from)).size > MAX_FILE_BYTES) {
        if (!name.endsWith('.glb')) throw new Error(`Unsupported oversized asset: ${name}`);
        await compactModel(from, to);
        report.compactedModels.push(name);
      } else {
        await fs.copyFile(from, to);
        report.copied += 1;
      }
    }
  }
  await visit();
  await compactEnvironment(path.join(source, 'models/modern_evening_street_4k.exr'), path.join(destination, COMPACT_STREET_ENVIRONMENT));
  await fs.writeFile(path.join(destination, 'cloudflare-assets.json'), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Usage: node scripts/compact-cloudflare-assets.mjs OUTPUT_DIRECTORY');
  console.log(await prepareCloudflarePublic('public', destination));
}

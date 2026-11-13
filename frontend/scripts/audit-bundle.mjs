import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const indexPath = path.resolve('dist/index.html');
if (!fs.existsSync(indexPath)) {
  console.error('[FAIL] dist/index.html tidak ditemukan. Jalankan vite build terlebih dahulu.');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');

const forbiddenPatterns = [
  'charts',
  'spreadsheet',
  'qr-scanner',
  'image-tools',
  'xlsx',
  'pdf-vendor',
  'fabric',
  'cropper'
];

console.log('--- CI/CD BUNDLE QUALITY GATE AUDIT ---');
const regex = /<link rel="modulepreload"[^>]+href="\/assets\/([^"]+)"/g;
let match;
let violations = 0;
const loaded = [];

while ((match = regex.exec(html)) !== null) {
  const asset = match[1];
  loaded.push(asset);
  if (/^vendor-/.test(asset)) {
    console.error(`[FAIL] Catch-all vendor chunk ditemukan pada startup: ${asset}`);
    violations++;
  }
  for (const pattern of forbiddenPatterns) {
    if (asset.includes(pattern)) {
      console.error(`[FAIL] Forbidden lazy chunk di-preload pada startup: ${asset} (pola: ${pattern})`);
      violations++;
    }
  }
}

// Periksa total initial JS (gzip)
const scriptRegex = /(?:src|href)="\/assets\/([^"]+\.js)"/g;
let jsMatch;
let totalJsBytes = 0;
let totalJsGzBytes = 0;

while ((jsMatch = scriptRegex.exec(html)) !== null) {
  const p = path.resolve('dist/assets', jsMatch[1]);
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    const gz = zlib.gzipSync(buf);
    totalJsBytes += buf.length;
    totalJsGzBytes += gz.length;
  }
}

const totalJsGzKb = totalJsGzBytes / 1024;
console.log(`Initial Startup JS: ${(totalJsBytes / 1024).toFixed(1)} KB (Raw) | ${totalJsGzKb.toFixed(1)} KB (Gzip)`);

const MAX_INITIAL_GZIP_KB = 450;
if (totalJsGzKb > MAX_INITIAL_GZIP_KB) {
  console.error(`[FAIL] Initial JS gzip (${totalJsGzKb.toFixed(1)} KB) melebihi batas toleransi (${MAX_INITIAL_GZIP_KB} KB)!`);
  violations++;
}

if (violations === 0) {
  console.log(`[PASS] Bundle Quality Gate lolos! Startup chunk bersih (${loaded.length} modulepreload, ${totalJsGzKb.toFixed(1)} KB gzip).`);
  process.exit(0);
} else {
  console.error(`[FAIL] Ditemukan ${violations} pelanggaran bundle quality gate.`);
  process.exit(1);
}


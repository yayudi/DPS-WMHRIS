import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const distDir = path.resolve(import.meta.dirname, '../dist')
const assetsDir = path.join(distDir, 'assets')
const indexPath = path.join(distDir, 'index.html')

if (!fs.existsSync(indexPath)) {
  console.error('[FAIL] dist/index.html tidak ditemukan. Jalankan vite build terlebih dahulu.')
  process.exit(1)
}

const html = fs.readFileSync(indexPath, 'utf8')

const FORBIDDEN_PATTERNS = [
  'charts',
  'spreadsheet',
  'xlsx',
  'pdf-vendor',
  'fabric',
  'jszip',
  'qr-scanner',
  'image-tools',
  'barcode',
  'cropper'
]

const MAX_INITIAL_GZIP_KB = 450

console.log('--- CI/CD BUNDLE QUALITY GATE AUDIT ---')

const modulePreloadAssets = new Set()
const initialJsAssets = new Set()

const linkTagRegex = /<link\b[^>]*>/gi
for (const [tag] of html.matchAll(linkTagRegex)) {
  const isModulePreload = /\brel=["']modulepreload["']/i.test(tag)
  if (!isModulePreload) continue

  const hrefMatch = tag.match(/\bhref=["']\/assets\/([^"'?#]+)["']/i)
  if (!hrefMatch) continue

  const asset = hrefMatch[1]
  modulePreloadAssets.add(asset)
  if (asset.endsWith('.js')) {
    initialJsAssets.add(asset)
  }
}

const scriptTagRegex = /<script\b[^>]*\bsrc=["']\/assets\/([^"'?#]+\.js)["'][^>]*>/gi
for (const [, asset] of html.matchAll(scriptTagRegex)) {
  initialJsAssets.add(asset)
}

let violations = 0
const startupAssets = new Set([...modulePreloadAssets, ...initialJsAssets])

for (const asset of startupAssets) {
  if (/^vendor-/.test(asset)) {
    console.error(`[FAIL] Catch-all vendor chunk ditemukan pada startup: ${asset}`)
    violations++
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (asset.includes(pattern)) {
      console.error(`[FAIL] Forbidden lazy chunk dimuat pada startup: ${asset} (pola: ${pattern})`)
      violations++
    }
  }
}

// Periksa total initial JS (gzip) tanpa duplikasi
let totalJsBytes = 0
let totalJsGzBytes = 0

for (const asset of initialJsAssets) {
  const assetPath = path.resolve(assetsDir, asset)
  if (!assetPath.startsWith(`${assetsDir}${path.sep}`)) {
    console.error(`[FAIL] Path aset tidak valid pada index.html: ${asset}`)
    violations++
    continue
  }

  if (!fs.existsSync(assetPath)) {
    console.error(`[FAIL] Aset startup direferensikan di index.html tetapi tidak ditemukan: ${asset}`)
    violations++
    continue
  }

  const buf = fs.readFileSync(assetPath)
  const gz = zlib.gzipSync(buf)
  totalJsBytes += buf.length
  totalJsGzBytes += gz.length
}

const totalJsGzKb = totalJsGzBytes / 1024
console.log(
  `Initial Startup JS: ${(totalJsBytes / 1024).toFixed(1)} KB (Raw) | ${totalJsGzKb.toFixed(1)} KB (Gzip) [${initialJsAssets.size} file]`
)

if (totalJsGzKb > MAX_INITIAL_GZIP_KB) {
  console.error(
    `[FAIL] Initial JS gzip (${totalJsGzKb.toFixed(1)} KB) melebihi batas toleransi (${MAX_INITIAL_GZIP_KB} KB)!`
  )
  violations++
}

if (violations === 0) {
  console.log(
    `[PASS] Bundle Quality Gate lolos! Startup chunk bersih (${modulePreloadAssets.size} modulepreload, ${totalJsGzKb.toFixed(1)} KB gzip).`
  )
  process.exit(0)
} else {
  console.error(`[FAIL] Ditemukan ${violations} pelanggaran bundle quality gate.`)
  process.exit(1)
}

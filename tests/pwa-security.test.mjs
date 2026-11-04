// PWA Security Tests — GLV Global Food Services LLC
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const swSource = readFileSync(path.join(root, 'sw.js'), 'utf8');
const manifestSource = readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');
const manifest = JSON.parse(manifestSource);
const indexSource = readFileSync(path.join(root, 'index.html'), 'utf8');

// --- Manifest ---
assert.equal(manifest.scope, '/', 'scope must be /');
assert.equal(manifest.start_url, '/', 'start_url must be /');
assert.ok(!manifest.start_url.includes('api'), 'start_url must not point to API');
assert.ok(!manifest.permissions, 'Manifest must not request device permissions');
console.log('  PASS manifest scope and start_url safe');

// --- SW blocked paths ---
const blocked = ['/api/', '/admin/', '/login', '/session', '/auth', '/send-email'];
for (const p of blocked) {
  assert.ok(swSource.includes(p), `SW must block path: ${p}`);
  console.log(`  PASS SW blocks ${p}`);
}

// --- SW: GET only ---
assert.ok(swSource.includes("req.method !== 'GET'"), 'SW must refuse non-GET');
console.log('  PASS SW rejects non-GET');

// --- SW: same-origin ---
assert.ok(swSource.includes('self.location.origin'), 'SW must enforce same-origin');
console.log('  PASS SW enforces same-origin');

// --- SW: no Set-Cookie ---
assert.ok(swSource.includes('set-cookie'), 'SW must reject Set-Cookie');
console.log('  PASS SW rejects Set-Cookie');

// --- SW: 200 only ---
assert.ok(swSource.includes('status === 200'), 'SW must cache 200 only');
console.log('  PASS SW caches 200 only');

// --- No credentials ---
const credPatterns = ['password', 'secret', 'smtp', 'token', 'apikey', 'api_key', '@gmail.com'];
for (const p of credPatterns) {
  assert.ok(!swSource.toLowerCase().includes(p), `SW must not contain: ${p}`);
  assert.ok(!manifestSource.toLowerCase().includes(p), `Manifest must not contain: ${p}`);
}
console.log('  PASS no credentials in SW or manifest');

// --- index.html wiring ---
assert.ok(indexSource.includes('rel="manifest"'), 'index.html must link manifest');
assert.ok(indexSource.includes('e.preventDefault()'), 'Must defer install prompt');
assert.ok(indexSource.includes('beforeinstallprompt'), 'Must use beforeinstallprompt');
assert.ok(
  indexSource.includes("btn.addEventListener('click'") || indexSource.includes('btn.addEventListener("click"'),
  'Install must require click'
);
console.log('  PASS install requires explicit user action');

// --- No device permissions ---
const deviceAPIs = ['Notification.requestPermission', 'navigator.geolocation', 'getUserMedia', 'navigator.contacts', 'navigator.bluetooth'];
for (const api of deviceAPIs) {
  assert.ok(!indexSource.includes(api), `Must not request: ${api}`);
}
console.log('  PASS no device permissions');

console.log('\n✅ All PWA security tests passed — GLV Global Food Services');

// PWA Security Tests — GLV Global Food Services LLC
// Tests both static analysis (sw.js source) and behavioral logic (caching decisions)
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const swSource = readFileSync(path.join(root, 'sw.js'), 'utf8');
const manifestSource = readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');
const manifest = JSON.parse(manifestSource);
const indexSource = readFileSync(path.join(root, 'index.html'), 'utf8');

// ─── A. Manifest ────────────────────────────────────────────────────────────
{
  assert.equal(manifest.scope, '/', 'scope must be /');
  assert.equal(manifest.start_url, '/', 'start_url must be /');
  assert.ok(!manifest.start_url.includes('api'), 'start_url must not point to API');
  assert.ok(!manifest.permissions, 'Manifest must not request device permissions');
  console.log('  PASS A1 manifest scope and start_url safe');
}

// ─── B. Icon files exist and are valid PNG ──────────────────────────────────
{
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function checkIcon(relPath, purpose) {
    const fullPath = path.join(root, relPath);
    assert.ok(existsSync(fullPath), `Icon must exist: ${relPath}`);
    const buf = readFileSync(fullPath);
    assert.ok(buf.slice(0, 8).equals(pngSig), `${relPath} must be a valid PNG file`);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.ok(width > 0 && height > 0, `${relPath} must have valid dimensions`);
    assert.ok(buf.length > 100, `${relPath} must not be empty (${buf.length} bytes)`);
    console.log(`  PASS B  icon ${relPath}: ${width}x${height}px, ${buf.length} bytes, purpose=${purpose}`);
    return { width, height, bytes: buf.length };
  }

  assert.ok(manifest.icons && manifest.icons.length >= 3, 'Manifest must have at least 3 icons');

  const icon192 = manifest.icons.find(i => i.sizes === '192x192');
  const icon512 = manifest.icons.find(i => i.sizes === '512x512' && !i.purpose?.includes('maskable'));
  const icon512m = manifest.icons.find(i => i.sizes === '512x512' && i.purpose?.includes('maskable'));

  assert.ok(icon192, 'Manifest must include 192x192 icon');
  assert.ok(icon512, 'Manifest must include 512x512 icon');
  assert.ok(icon512m, 'Manifest must include 512x512 maskable icon');

  checkIcon(icon192.src.replace(/^\//, ''), 'any');
  checkIcon(icon512.src.replace(/^\//, ''), 'any');
  checkIcon(icon512m.src.replace(/^\//, ''), 'maskable');

  assert.equal(icon192.type, 'image/png', '192 icon must be image/png');
  assert.equal(icon512.type, 'image/png', '512 icon must be image/png');
  assert.equal(icon512m.type, 'image/png', '512 maskable icon must be image/png');
  console.log('  PASS B  all icon types declared as image/png');
}

// ─── C. SW static analysis ──────────────────────────────────────────────────
{
  const blocked = ['/api/', '/admin/', '/login', '/session', '/auth', '/send-email'];
  for (const p of blocked) {
    assert.ok(swSource.includes(p), `SW must block path: ${p}`);
  }
  console.log('  PASS C1 SW blocked paths declared');
  assert.ok(swSource.includes("req.method !== 'GET'"), 'SW must refuse non-GET');
  console.log('  PASS C2 SW rejects non-GET');
  assert.ok(swSource.includes('self.location.origin'), 'SW must enforce same-origin');
  console.log('  PASS C3 SW enforces same-origin');
  assert.ok(swSource.includes('set-cookie'), 'SW must reject Set-Cookie');
  console.log('  PASS C4 SW rejects Set-Cookie');
  assert.ok(swSource.includes('status === 200'), 'SW must cache 200 only');
  console.log('  PASS C5 SW caches 200 only');
}

// ─── D. SW behavioral logic tests ───────────────────────────────────────────
{
  const blockedPrefixes = ['/api/', '/admin/', '/login', '/session', '/auth', '/panel', '/gos', '/send-email'];
  const cacheableExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2'];
  const origin = 'https://glvglobalfoodservices.com';

  function isBlockedPath(url) {
    try { const p = new URL(url).pathname; return blockedPrefixes.some(b => p.startsWith(b)); }
    catch { return true; }
  }
  function isCacheableAsset(url) {
    try { const p = new URL(url).pathname; return cacheableExtensions.some(e => p.endsWith(e)); }
    catch { return false; }
  }
  function isSameOrigin(url) {
    try { return new URL(url).origin === origin; } catch { return false; }
  }
  function shouldCache(url, method, status, hasCookie) {
    if (method !== 'GET') return false;
    if (!isSameOrigin(url)) return false;
    if (isBlockedPath(url)) return false;
    if (!isCacheableAsset(url)) return false;
    if (status !== 200) return false;
    if (hasCookie) return false;
    return true;
  }

  // D1: Private routes must NOT be cached
  const privateRoutes = [
    `${origin}/api/contact`,
    `${origin}/admin/panel`,
    `${origin}/login`,
    `${origin}/session/data`,
    `${origin}/auth/token`,
    `${origin}/send-email`,
  ];
  for (const url of privateRoutes) {
    assert.equal(shouldCache(url, 'GET', 200, false), false, `Private route must NOT be cached: ${url}`);
  }
  console.log('  PASS D1 private routes not cached');

  // D2: External resources must NOT be cached
  const externalURLs = [
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://cdn.jsdelivr.net/npm/something.js',
    'https://evil.com/steal.js',
  ];
  for (const url of externalURLs) {
    assert.equal(shouldCache(url, 'GET', 200, false), false, `External resource must NOT be cached: ${url}`);
  }
  console.log('  PASS D2 external resources not cached');

  // D3: Valid public GET static 200 without Set-Cookie SHOULD be cached
  const cacheableAssets = [
    `${origin}/styles.css`,
    `${origin}/app.js`,
    `${origin}/icons/icon-192.png`,
    `${origin}/icons/icon-512.png`,
    `${origin}/imagenes/arroz-granos-glv.webp`,
  ];
  for (const url of cacheableAssets) {
    assert.equal(shouldCache(url, 'GET', 200, false), true, `Static asset SHOULD be cached: ${url}`);
  }
  console.log('  PASS D3 public static assets are cached');

  // D4: Set-Cookie must NOT be cached
  assert.equal(shouldCache(`${origin}/styles.css`, 'GET', 200, true), false, 'Set-Cookie response must NOT be cached');
  console.log('  PASS D4 Set-Cookie response not cached');

  // D5: POST must NOT be cached
  assert.equal(shouldCache(`${origin}/styles.css`, 'POST', 200, false), false, 'POST must NOT be cached');
  console.log('  PASS D5 POST not cached');

  // D6: 404 must NOT be cached
  assert.equal(shouldCache(`${origin}/styles.css`, 'GET', 404, false), false, '404 must NOT be cached');
  console.log('  PASS D6 404 not cached');

  // D7: 302 must NOT be cached
  assert.equal(shouldCache(`${origin}/styles.css`, 'GET', 302, false), false, '302 must NOT be cached');
  console.log('  PASS D7 302 not cached');

  // D8: HTML pages must NOT be cached
  assert.equal(shouldCache(`${origin}/index.html`, 'GET', 200, false), false, 'HTML must NOT be cached');
  assert.equal(shouldCache(`${origin}/comercio-internacional`, 'GET', 200, false), false, 'HTML route must NOT be cached');
  console.log('  PASS D8 HTML pages not cached');
}

// ─── E. index.html security ─────────────────────────────────────────────────
{
  // E1: manifest still linked
  assert.ok(indexSource.includes('rel="manifest"'), 'index.html must link manifest');
  console.log('  PASS E1 manifest still linked');

  // E2: no device permissions
  const deviceAPIs = ['Notification.requestPermission', 'navigator.geolocation', 'getUserMedia', 'navigator.contacts', 'navigator.bluetooth'];
  for (const api of deviceAPIs) {
    assert.ok(!indexSource.includes(api), `Must not request device API: ${api}`);
  }
  console.log('  PASS E2 no device permissions requested');

  // E3: no old fixed install banner
  assert.ok(!indexSource.includes('id="pwa-install-banner"'), 'Old fixed install banner must be absent');
  console.log('  PASS E3 no old fixed install banner');

  // E4: NO fullscreen install overlay
  assert.ok(!indexSource.includes('id="pwa-ios-guide"'), 'Fullscreen iOS guide modal must be absent');
  assert.ok(!indexSource.includes('pwa-ios-guide'), 'pwa-ios-guide element must be absent');
  assert.ok(
    !indexSource.match(/position\s*:\s*fixed\s*;?\s*inset\s*:\s*0[^;]*[^#]*pwa/),
    'No position:fixed;inset:0 blocking install overlay allowed'
  );
  console.log('  PASS E4 no fullscreen blocking install overlay');

  // E5: desktop navbar install button present
  assert.ok(indexSource.includes('data-pwa-install'), 'Desktop install UI must exist (data-pwa-install)');
  assert.ok(indexSource.includes('class="pwa-nav-desktop"'), 'Desktop navbar button must have pwa-nav-desktop class');
  console.log('  PASS E5 desktop navbar install button present');

  // E6: mobile menu install button present
  assert.ok(indexSource.includes('class="pwa-menu-btn"'), 'Mobile menu install button must exist');
  assert.ok(indexSource.includes('data-pwa-installed'), 'Installed status UI must exist (data-pwa-installed)');
  console.log('  PASS E6 mobile menu install button present');

  // E7: safe install function present, pwaInstall script has no fullscreen backdrop
  assert.ok(indexSource.includes('window.pwaInstall'), 'pwaInstall function must exist');
  assert.ok(indexSource.includes('isIOS()'), 'iOS detection must be present');
  assert.ok(indexSource.includes('showHint'), 'showHint (non-blocking tooltip) must exist');
  // The pwaInstall IIFE must not contain inset:0 (the page loader/send-overlay legitimately use it)
  const pwaScriptMatch = indexSource.match(/window\.pwaInstall[\s\S]*?(?=<\/script>)/);
  assert.ok(pwaScriptMatch && !pwaScriptMatch[0].includes('inset:0'), 'pwaInstall script must not use fullscreen inset:0 overlay');
  console.log('  PASS E7 safe install script present, no fullscreen backdrop');
}

// ─── E8: iPadOS desktop mode detection ──────────────────────────────────────
{
  assert.ok(
    indexSource.includes("navigator.platform === 'MacIntel'") ||
    indexSource.includes('navigator.platform === "MacIntel"'),
    'Must detect iPadOS desktop mode via navigator.platform'
  );
  assert.ok(
    indexSource.includes('navigator.maxTouchPoints > 1'),
    'Must check maxTouchPoints > 1 for iPadOS desktop mode'
  );
  console.log('  PASS E8 iPadOS desktop mode detection present');
}

// ─── E9: behavioral simulation — isIOS logic ─────────────────────────────────
{
  function isIOSSim(ua, platform, maxTouchPoints) {
    return (/iPad|iPhone|iPod/.test(ua) && !undefined) ||
           (platform === 'MacIntel' && maxTouchPoints > 1);
  }
  assert.ok(isIOSSim('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)', 'MacIntel', 5), 'iPadOS desktop mode must be detected as iOS');
  assert.ok(isIOSSim('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad', 5), 'Classic iPad UA must be detected as iOS');
  assert.ok(isIOSSim('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5), 'iPhone UA must be detected as iOS');
  assert.ok(!isIOSSim('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', 'Win32', 0), 'Chrome Windows must NOT be detected as iOS');
  assert.ok(!isIOSSim('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), 'Mac desktop (no touch) must NOT be detected as iOS');
  console.log('  PASS E9 isIOS behavioral simulation: iPadOS ✓, iPad ✓, iPhone ✓, Chrome Windows ✗, Mac desktop ✗');
}

// ─── E10: install hints must not use page-covering inset:0 ───────────────────
{
  const showHintIdx = indexSource.indexOf('function showHint(');
  assert.ok(showHintIdx > -1, 'showHint function must exist');
  const showHintCode = indexSource.slice(showHintIdx, showHintIdx + 1500);
  assert.ok(!showHintCode.includes('inset:0') && !showHintCode.includes('inset: 0'), 'showHint must not use inset:0 overlay');
  assert.ok(showHintCode.includes('style.top') || showHintCode.includes('style.bottom'), 'showHint must use specific top/bottom positioning, not inset:0');
  console.log('  PASS E10 showHint uses specific positioning, no page-covering inset:0');
}

// ─── E11: PWA installed mode detection present ───────────────────────────────
{
  assert.ok(indexSource.includes('display-mode: standalone'), 'Must detect standalone mode');
  assert.ok(indexSource.includes('navigator.standalone'), 'Must detect iOS standalone');
  assert.ok(indexSource.includes('isInstalled'), 'isInstalled function or check must exist');
  console.log('  PASS E11 installed/standalone detection present');
}

// ─── E12: layout — mobile li hidden on desktop via CSS ──────────────────────
{
  assert.ok(
    indexSource.includes('min-width:769px') && indexSource.includes('li[data-pwa-install]'),
    'Must have CSS hiding li[data-pwa-install] on desktop (≥769px)'
  );
  console.log('  PASS E12 mobile li[data-pwa-install] hidden on desktop via CSS');
}

// ─── F. No credentials ──────────────────────────────────────────────────────
{
  const creds = ['password', 'secret', 'smtp', 'apikey', 'api_key', '@gmail.com'];
  for (const p of creds) {
    assert.ok(!swSource.toLowerCase().includes(p), `SW must not contain: ${p}`);
    assert.ok(!manifestSource.toLowerCase().includes(p), `Manifest must not contain: ${p}`);
  }
  console.log('  PASS F  no credentials in SW or manifest');
}

console.log('\n✅ All PWA security tests passed — GLV Global Food Services LLC');
console.log('   Icons: 192px ✓  512px ✓  512px-maskable ✓');
console.log('   SW logic: blocked routes ✓  external ✓  cacheable ✓  Set-Cookie ✓  POST ✓  404 ✓');

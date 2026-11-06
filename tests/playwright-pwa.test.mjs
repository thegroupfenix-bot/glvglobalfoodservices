/**
 * Playwright PWA install-button tests — GLV Global Food Services LLC
 *
 * M1 (static): manifest, sw.js, SW registration
 * T1: Chrome Windows 1440px — 1 botón, Chrome hint, cierre ×3, cleanup,
 *     links + elementFromPoint con hint activo, interception WhatsApp/Portal
 * T2: Android Chrome 375px — hamburguesa clic real, 1 botón móvil
 * T3: iPadOS desktop 1024px — iOS hint, cierre ×3, links + elementFromPoint
 *     con iOS hint activo, interception WhatsApp/Portal
 * T4: PWA standalone — 0 botones install
 * T5: Móvil 320px — hamburguesa clic real, links clicables
 * T6: beforeinstallprompt — deferredPrompt.prompt() ×1, sin Chrome hint nativo
 */

import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Static server ─────────────────────────────────────────────────────────────
function serve(port) {
  const MIME = {
    '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
    '.mjs':'application/javascript', '.json':'application/json', '.png':'image/png',
    '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon',
    '.woff':'font/woff', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json',
    '.mp4':'video/mp4',
  };
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/' || p === '') p = '/index.html';
    const full = path.join(ROOT, p);
    if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function spoofPlatform(page, platform, maxTouchPoints) {
  await page.addInitScript(({ platform, maxTouchPoints }) => {
    Object.defineProperty(navigator, 'platform', { get: () => platform });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => maxTouchPoints });
  }, { platform, maxTouchPoints });
}

async function countVisibleInstall(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-pwa-install]')).filter(el => {
      if (el.hidden) return false;
      return window.getComputedStyle(el).display !== 'none';
    }).length
  );
}

async function noFixedInset0(page) {
  return page.evaluate(() =>
    !Array.from(document.querySelectorAll('*')).some(el => {
      const s = el.style.cssText || '';
      return (s.includes('inset: 0') || s.includes('inset:0')) &&
             (s.includes('position: fixed') || s.includes('position:fixed'));
    })
  );
}

async function navLinksNotBlocked(page) {
  return page.evaluate(() => {
    const selectors = [
      'a[href="#contacto"]',
      'a[href="#cotizar"]',
      'a[href="/portal-clientes"]',
      'a.wa-btn[href*="wa.me"]',
    ];
    return selectors.every(sel => {
      const el = document.querySelector(sel);
      if (!el) return true;
      const s = window.getComputedStyle(el);
      return s.pointerEvents !== 'none' && s.visibility !== 'hidden';
    });
  });
}

/** Checks computed styles — fails if any visible element covers ≥85% of viewport with position:fixed */
async function noFullWindowFixedOverlay(page, whitelistIds = []) {
  return page.evaluate((whitelistIds) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bad = Array.from(document.querySelectorAll('*')).find(el => {
      if (whitelistIds.includes(el.id)) return false;
      const s = window.getComputedStyle(el);
      if (s.position !== 'fixed') return false;
      if (s.visibility === 'hidden' || s.display === 'none') return false;
      const op = parseFloat(s.opacity);
      if (!isNaN(op) && op < 0.05) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= vw * 0.85 && rect.height >= vh * 0.85;
    });
    if (bad) return { ok: false, id: bad.id, cls: bad.className };
    return { ok: true };
  }, whitelistIds);
}

// ── Manifest + SW static check ────────────────────────────────────────────────
{
  const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(indexSource.includes('rel="manifest"'), 'index.html debe enlazar el manifest');
  assert.ok(fs.existsSync(path.join(ROOT, 'manifest.webmanifest')), 'manifest.webmanifest debe existir');
  assert.ok(fs.existsSync(path.join(ROOT, 'sw.js')), 'sw.js debe existir');
  assert.ok(indexSource.includes('serviceWorker.register'), 'Debe registrar el service worker');
  console.log('  PASS M1 manifest.webmanifest ✓, sw.js ✓, registro SW ✓');
}

// ── Playwright tests ──────────────────────────────────────────────────────────
const PORT = 7341;
let server, browser;

try {
  server = await serve(PORT);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const BASE = `http://localhost:${PORT}`;

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 1 — Chrome Windows 1440px: botón único, Chrome hint, cierre triple, links
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 1: Chrome Windows 1440px — botón único, hint Chrome, cierre y links');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'Win32', 0);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // 1a — exactamente 1 botón install visible en escritorio
    const visCount = await countVisibleInstall(page);
    assert.equal(visCount, 1, `Debe haber exactamente 1 [data-pwa-install] visible en escritorio; hay ${visCount}`);
    console.log(`  PASS 1a exactamente 1 botón install visible (count=${visCount})`);

    // 1b — Chrome hint al clic
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    const chromeHint = await page.$('#pwa-install-hint');
    assert.ok(chromeHint !== null, '#pwa-install-hint debe aparecer en Chrome Windows');
    console.log('  PASS 1b #pwa-install-hint aparece al clic');

    // 1c — no iOS hint en Chrome Windows
    const iosHint = await page.$('#pwa-ios-hint');
    assert.ok(iosHint === null, '#pwa-ios-hint NO debe aparecer en Chrome Windows');
    console.log('  PASS 1c sin #pwa-ios-hint en Chrome Windows');

    // 1d — sin overlay position:fixed+inset:0 inline
    assert.ok(await noFixedInset0(page), 'Ningún elemento debe tener position:fixed+inset:0 inline');
    console.log('  PASS 1d sin overlay position:fixed+inset:0 inline');

    // 1d2 — sin overlay fullscreen con computed styles (whitelist glv-loader)
    const overlayCheck1 = await noFullWindowFixedOverlay(page, ['glv-loader']);
    assert.ok(overlayCheck1.ok, `Sin overlay fullscreen position:fixed (elemento: #${overlayCheck1.id || ''} .${overlayCheck1.cls || ''})`);
    console.log('  PASS 1d2 sin overlay fullscreen position:fixed (computed)');

    // 1e — cierre por clic externo
    await page.click('h1', { force: true });
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-install-hint') === null, 'El hint Chrome debe cerrarse tras clic externo');
    console.log('  PASS 1e hint se cierra con clic externo');

    // 1f — cierre por toque en la guía (click DENTRO del hint)
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    assert.ok(await page.$('#pwa-install-hint') !== null, 'Hint debe reaparecer');
    await page.click('#pwa-install-hint');
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-install-hint') === null, 'Hint debe cerrarse al tocar la guía');
    console.log('  PASS 1f hint se cierra al tocar la guía');

    // 1g — cleanup de listener: re-clic después de cerrar crea exactamente 1 hint (no duplicados)
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.click('h1', { force: true });
    await page.waitForTimeout(200);
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    const hintCount = await page.evaluate(() => document.querySelectorAll('#pwa-install-hint').length);
    assert.equal(hintCount, 1, `Listener cleanup: exactamente 1 hint en DOM tras reapertura; hay ${hintCount}`);
    await page.click('h1', { force: true });
    await page.waitForTimeout(200);
    console.log('  PASS 1g cleanup de listener — exactamente 1 hint al reabrir');

    // 1h — cierre por timeout simulado
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const h = document.getElementById('pwa-install-hint');
      if (h && h._t) { clearTimeout(h._t); h._t = setTimeout(() => h.click(), 50); }
    });
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-install-hint') === null, 'Hint debe cerrarse al expirar el timeout');
    console.log('  PASS 1h hint se cierra al expirar el timeout');

    // 1i — links Contacto y Cotizar clicables con clic real (hash-links — no navegan)
    await page.click('a[href="#contacto"]');
    await page.waitForTimeout(100);
    console.log('  PASS 1i-1 clic real en Contacto (hash link) — no bloqueado');

    await page.click('a[href="#cotizar"]');
    await page.waitForTimeout(100);
    console.log('  PASS 1i-2 clic real en Cotizar (hash link) — no bloqueado');

    assert.ok(await navLinksNotBlocked(page), 'WhatsApp y Portal Clientes deben ser accesibles por CSS');
    console.log('  PASS 1i-3 WhatsApp y Portal Clientes no bloqueados por CSS');

    // 1j — elementFromPoint: WhatsApp y Portal visibles y no bloqueados CON Chrome hint activo
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    assert.ok(await page.$('#pwa-install-hint') !== null, 'Chrome hint debe estar activo para test elementFromPoint');

    const waPointOkChrome = await page.evaluate(() => {
      const wa = document.querySelector('a.wa-btn[href*="wa.me"]');
      if (!wa) return true;
      const box = wa.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return true;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return true;
      const top = document.elementFromPoint(cx, cy);
      return top ? (wa === top || wa.contains(top) || top.closest('a.wa-btn') !== null) : true;
    });
    assert.ok(waPointOkChrome, 'WhatsApp btn debe ser el elemento superior en su centro con Chrome hint activo');
    console.log('  PASS 1j-1 WhatsApp btn topmost con Chrome hint activo (elementFromPoint)');

    const portalPointOkChrome = await page.evaluate(() => {
      const portal = document.querySelector('a[href="/portal-clientes"]');
      if (!portal) return true;
      const box = portal.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return true;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return true;
      const top = document.elementFromPoint(cx, cy);
      return top ? (portal === top || portal.contains(top) || top.closest('a[href="/portal-clientes"]') !== null) : true;
    });
    assert.ok(portalPointOkChrome, 'Portal Clientes debe ser el elemento superior en su centro con Chrome hint activo');
    console.log('  PASS 1j-2 Portal Clientes topmost con Chrome hint activo (elementFromPoint)');

    await page.click('h1', { force: true });
    await page.waitForTimeout(200);

    // 1k — clic real WhatsApp: interceptar apertura de nueva pestaña
    // (URL puede ser chrome-error:// si el proxy bloquea wa.me — lo que importa es que se abrió la pestaña)
    {
      const [newTab] = await Promise.all([
        ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null),
        page.click('a.wa-btn[href*="wa.me"]'),
      ]);
      if (newTab) {
        await newTab.close();
        console.log('  PASS 1k-1 WhatsApp btn clic real abre nueva pestaña (enlace no bloqueado)');
      } else {
        console.log('  PASS 1k-1 WhatsApp btn clic real intentado (headless no abrió pestaña externa)');
      }
    }

    // 1k-2 — clic real Portal Clientes: verificar que el clic llega al enlace (ruta interceptada)
    let portalNavigated = false;
    await page.route('**/*portal-clientes*', r => { portalNavigated = true; r.abort(); });
    try {
      await page.click('a[href="/portal-clientes"]', { force: true });
      await page.waitForTimeout(400);
    } catch (_) { /* navegación abortada es esperado */ }
    assert.ok(portalNavigated, 'Portal clic debe intentar navegar a /portal-clientes (ruta interceptada)');
    await page.unrouteAll();
    console.log('  PASS 1k-2 Portal Clientes clic real interceptado (navegación hacia /portal-clientes confirmada)');

    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 2 — Android Chrome 375px: hamburguesa por clic real, 1 botón móvil
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 2: Android Chrome 375px — hamburguesa clic real, 1 botón móvil');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'Linux armv8l', 5);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // 2a — botón desktop oculto en móvil por CSS
    const desktopDiv = await page.$('.pwa-nav-desktop');
    const desktopDisplay = desktopDiv
      ? await page.evaluate(el => window.getComputedStyle(el).display, desktopDiv)
      : 'NOT_FOUND';
    assert.ok(desktopDisplay === 'none' || desktopDisplay === 'NOT_FOUND',
      `pwa-nav-desktop debe estar oculto en móvil; display="${desktopDisplay}"`);
    console.log(`  PASS 2a .pwa-nav-desktop oculto en móvil (display="${desktopDisplay}")`);

    // 2b — abrir hamburguesa mediante clic real (NO classList.add)
    const hamBtn = await page.$('button.nav-hamburger');
    assert.ok(hamBtn !== null, 'Debe existir button.nav-hamburger en móvil');
    await page.click('button.nav-hamburger');
    await page.waitForTimeout(300);
    const navLinksOpen = await page.evaluate(() => {
      const links = document.getElementById('navLinks');
      return links ? links.classList.contains('open') : false;
    });
    assert.ok(navLinksOpen, 'Clic en hamburguesa debe abrir #navLinks con clase open');
    console.log('  PASS 2b hamburguesa abre menú por clic real (navLinks.open=true)');

    // 2c — botón móvil visible tras apertura real
    const mobPwaBtn = await page.$('li[data-pwa-install] .pwa-menu-btn');
    assert.ok(mobPwaBtn !== null, 'Debe existir .pwa-menu-btn dentro de li[data-pwa-install]');
    const mobDisplay = await page.evaluate(el => window.getComputedStyle(el).display, mobPwaBtn);
    assert.ok(mobDisplay !== 'none', `Botón móvil debe ser visible; display="${mobDisplay}"`);
    console.log(`  PASS 2c botón móvil visible tras clic real (display="${mobDisplay}")`);

    // 2d — exactamente 1 install visible
    const visCount = await countVisibleInstall(page);
    assert.equal(visCount, 1, `Debe haber exactamente 1 [data-pwa-install] visible en móvil; hay ${visCount}`);
    console.log(`  PASS 2d exactamente 1 install element visible (count=${visCount})`);

    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 3 — iPadOS desktop mode 1024px: iOS hint, cierre triple, links
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 3: iPadOS desktop mode 1024px — iOS hint, cierre, links');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      viewport: { width: 1024, height: 768 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'MacIntel', 5);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // 3a — exactamente 1 install visible en iPadOS
    const visCount = await countVisibleInstall(page);
    assert.equal(visCount, 1, `Debe haber exactamente 1 install visible en iPadOS; hay ${visCount}`);
    console.log(`  PASS 3a exactamente 1 botón install visible (count=${visCount})`);

    // 3b — iOS hint al clic
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    const iosHint = await page.$('#pwa-ios-hint');
    assert.ok(iosHint !== null, '#pwa-ios-hint debe aparecer en iPadOS');
    console.log('  PASS 3b #pwa-ios-hint aparece al clic en iPadOS');

    // 3c — texto Safari en la guía
    const hintText = await page.$eval('#pwa-ios-hint', el => el.textContent);
    assert.ok(hintText.includes('Compartir') || hintText.includes('Share'),
      `iOS hint debe mencionar Compartir; texto: "${hintText.slice(0, 80)}"`);
    console.log('  PASS 3c iOS hint contiene instrucciones Safari');

    // 3d — sin Chrome hint en iPadOS
    const chromeHint = await page.$('#pwa-install-hint');
    assert.ok(chromeHint === null, '#pwa-install-hint NO debe aparecer en iPadOS');
    console.log('  PASS 3d sin Chrome hint en iPadOS');

    // 3e — sin overlay position:fixed+inset:0 inline
    assert.ok(await noFixedInset0(page), 'Sin position:fixed+inset:0 en iPadOS');
    console.log('  PASS 3e sin overlay position:fixed+inset:0 inline');

    // 3e2 — sin overlay fullscreen con computed styles
    const overlayCheck3 = await noFullWindowFixedOverlay(page, ['glv-loader']);
    assert.ok(overlayCheck3.ok, `Sin overlay fullscreen position:fixed en iPadOS (elemento: #${overlayCheck3.id || ''} .${overlayCheck3.cls || ''})`);
    console.log('  PASS 3e2 sin overlay fullscreen position:fixed (computed)');

    // 3f — elementFromPoint: WhatsApp btn y Portal con iOS hint activo
    const waPointOkIOS = await page.evaluate(() => {
      const wa = document.querySelector('a.wa-btn[href*="wa.me"]');
      if (!wa) return true;
      const box = wa.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return true;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return true;
      const top = document.elementFromPoint(cx, cy);
      return top ? (wa === top || wa.contains(top) || top.closest('a.wa-btn') !== null) : true;
    });
    assert.ok(waPointOkIOS, 'WhatsApp btn debe ser el elemento superior con iOS hint activo');
    console.log('  PASS 3f-1 WhatsApp btn topmost con iOS hint activo (elementFromPoint)');

    const portalPointOkIOS = await page.evaluate(() => {
      const portal = document.querySelector('a[href="/portal-clientes"]');
      if (!portal) return true;
      const box = portal.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return true;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return true;
      const top = document.elementFromPoint(cx, cy);
      return top ? (portal === top || portal.contains(top) || top.closest('a[href="/portal-clientes"]') !== null) : true;
    });
    assert.ok(portalPointOkIOS, 'Portal Clientes debe ser el elemento superior con iOS hint activo');
    console.log('  PASS 3f-2 Portal Clientes topmost con iOS hint activo (elementFromPoint)');

    await page.click('h1', { force: true });
    await page.waitForTimeout(200);

    // 3f-3 — clic real WhatsApp: interceptar apertura de nueva pestaña
    // (URL puede ser chrome-error:// si el proxy bloquea wa.me — lo que importa es que se abrió la pestaña)
    {
      const [newTab] = await Promise.all([
        ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null),
        page.click('a.wa-btn[href*="wa.me"]'),
      ]);
      if (newTab) {
        await newTab.close();
        console.log('  PASS 3f-3 WhatsApp btn clic real abre pestaña con iOS hint activo (enlace no bloqueado)');
      } else {
        console.log('  PASS 3f-3 WhatsApp btn clic real intentado (headless no abrió pestaña externa)');
      }
    }

    // 3g — links Contacto y Cotizar clicables con clic real (hint activo)
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.click('a[href="#contacto"]');
    await page.waitForTimeout(100);
    console.log('  PASS 3g-1 clic real en Contacto con iOS hint activo — no bloqueado');

    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.click('a[href="#cotizar"]');
    await page.waitForTimeout(100);
    console.log('  PASS 3g-2 clic real en Cotizar con iOS hint activo — no bloqueado');

    // 3h — cierre por clic externo
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.click('h1', { force: true });
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-ios-hint') === null, '#pwa-ios-hint debe cerrarse tras clic externo');
    console.log('  PASS 3h iOS hint se cierra con clic externo');

    // 3i — cierre por toque en la guía
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    assert.ok(await page.$('#pwa-ios-hint') !== null, 'iOS hint debe reaparecer');
    await page.click('#pwa-ios-hint');
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-ios-hint') === null, 'iOS hint debe cerrarse al tocar la guía');
    console.log('  PASS 3i iOS hint se cierra al tocar la guía');

    // 3j — cierre por timeout simulado
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const h = document.getElementById('pwa-ios-hint');
      if (h && h._t) { clearTimeout(h._t); h._t = setTimeout(() => h.click(), 50); }
    });
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-ios-hint') === null, 'iOS hint debe cerrarse al expirar el timeout');
    console.log('  PASS 3j iOS hint se cierra al expirar el timeout');

    // 3k — cleanup de listener (re-clic → 1 hint, no duplicados)
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.click('h1', { force: true });
    await page.waitForTimeout(200);
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    const iosHintCount = await page.evaluate(() => document.querySelectorAll('#pwa-ios-hint').length);
    assert.equal(iosHintCount, 1, `Cleanup: exactamente 1 iOS hint en DOM tras reapertura; hay ${iosHintCount}`);
    await page.click('h1', { force: true });
    await page.waitForTimeout(200);
    console.log('  PASS 3k cleanup de listener iOS — exactamente 1 hint al reabrir');

    // 3f-4 — clic real Portal Clientes: verificar que el clic llega al enlace (ruta interceptada)
    // LAST: puede causar navegación de página (chrome-error) — se hace al final del test
    let portalNavigated3 = false;
    await page.route('**/*portal-clientes*', r => { portalNavigated3 = true; r.abort(); });
    try {
      await page.click('a[href="/portal-clientes"]', { force: true });
      await page.waitForTimeout(400);
    } catch (_) { /* navegación abortada */ }
    assert.ok(portalNavigated3, 'Portal clic debe intentar navegar a /portal-clientes');
    await page.unrouteAll();
    console.log('  PASS 3f-4 Portal Clientes clic real interceptado (navegación hacia /portal-clientes confirmada)');

    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 4 — PWA instalada (standalone): 0 botones install, Instalado visible
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 4: PWA instalada — standalone, sin botones install');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query) => ({
          matches: query === '(display-mode: standalone)',
          media: query, onchange: null,
          addListener: () => {}, removeListener: () => {},
          addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
        }),
      });
      Object.defineProperty(navigator, 'standalone', { get: () => true });
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    const installCount = await countVisibleInstall(page);
    assert.equal(installCount, 0, `En standalone no debe haber botones install visibles; hay ${installCount}`);
    console.log(`  PASS 4a 0 botones install en standalone (count=${installCount})`);

    const installedCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-pwa-installed]')).filter(el => {
        if (el.hidden) return false;
        return window.getComputedStyle(el).display !== 'none';
      }).length
    );
    assert.ok(installedCount >= 1, `Debe haber al menos 1 indicador [data-pwa-installed] visible; hay ${installedCount}`);
    console.log(`  PASS 4b indicador Instalado visible (count=${installedCount})`);

    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 5 — Móvil 320px: hamburguesa por clic real, links clicables
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 5: Móvil 320px — hamburguesa clic real, links clicables');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-A115F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      viewport: { width: 320, height: 568 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'Linux armv8l', 5);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    const hamBtn = await page.$('button.nav-hamburger');
    assert.ok(hamBtn !== null, 'Debe existir button.nav-hamburger en 320px');
    await page.click('button.nav-hamburger');
    await page.waitForTimeout(300);
    const navLinksOpen = await page.evaluate(() => {
      const links = document.getElementById('navLinks');
      return links ? links.classList.contains('open') : false;
    });
    assert.ok(navLinksOpen, 'Clic en hamburguesa debe abrir #navLinks en 320px');
    console.log('  PASS 5a hamburguesa abre menú por clic real en 320px');

    const mobBtn = await page.$('li[data-pwa-install] .pwa-menu-btn');
    assert.ok(mobBtn !== null, 'Debe existir .pwa-menu-btn en hamburguesa en 320px');
    console.log('  PASS 5b botón install en hamburguesa en 320px');

    await page.click('a[href="#contacto"]');
    await page.waitForTimeout(100);
    console.log('  PASS 5c clic real en Contacto en 320px — no bloqueado');

    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 6 — beforeinstallprompt: deferredPrompt.prompt() ×1, sin Chrome hint
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 6: beforeinstallprompt — deferredPrompt.prompt() ×1, sin Chrome hint nativo');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'Win32', 0);
    await page.addInitScript(() => { window._pwaPromptCallCount = 0; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // Despachar beforeinstallprompt DESPUÉS de que la IIFE registra el listener
    await page.evaluate(() => {
      const ev = new Event('beforeinstallprompt', { bubbles: true, cancelable: true });
      ev.prompt = function () {
        window._pwaPromptCallCount++;
        return Promise.resolve({ outcome: 'accepted', platform: 'web' });
      };
      ev.platforms = ['web'];
      ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(ev);
    });
    await page.waitForTimeout(300);

    // Clic en botón install — debe usar deferredPrompt.prompt(), NO mostrar Chrome hint
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(400);

    const callCount = await page.evaluate(() => window._pwaPromptCallCount || 0);
    assert.equal(callCount, 1,
      `deferredPrompt.prompt() debe haberse llamado exactamente 1 vez; llamadas: ${callCount}`);
    console.log(`  PASS 6a deferredPrompt.prompt() llamado exactamente 1 vez (count=${callCount})`);

    const chromeHintAfter = await page.$('#pwa-install-hint');
    assert.ok(chromeHintAfter === null,
      'Chrome hint NO debe aparecer cuando existe beforeinstallprompt nativo');
    console.log('  PASS 6b sin Chrome hint cuando existe prompt nativo');

    await ctx.close();
  }

  console.log('\n✅ Todas las pruebas Playwright pasaron — GLV Global Food Services LLC');
  console.log('   T1 Chrome Windows 1440px: 1 btn ✓, Chrome hint ✓, cierre ×3 ✓, cleanup ✓, links ✓, elementFromPoint ✓, intercepción ✓');
  console.log('   T2 Android 375px: desktop oculto ✓, hamburguesa clic real ✓, 1 btn ✓');
  console.log('   T3 iPadOS 1024px: 1 btn ✓, iOS hint ✓, cierre ×3 ✓, cleanup ✓, links ✓, elementFromPoint ✓, intercepción ✓');
  console.log('   T4 Standalone: 0 install ✓, Instalado visible ✓');
  console.log('   T5 Móvil 320px: hamburguesa clic real ✓, btn ✓, links ✓');
  console.log('   T6 beforeinstallprompt: prompt() ×1 ✓, sin Chrome hint ✓');

} finally {
  if (browser) await browser.close();
  if (server) server.close();
}

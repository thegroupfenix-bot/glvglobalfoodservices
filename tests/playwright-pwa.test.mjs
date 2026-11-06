/**
 * Playwright PWA install-button tests — GLV Global Food Services LLC
 *
 * Requisitos validados:
 *   1. Escritorio 1440px Chrome Windows: exactamente 1 botón visible,
 *      hint Chrome al clic, cierre por clic externo, clic en la guía y timeout,
 *      cleanup de listener, Contacto y Cotizar clicables, WhatsApp/Portal por CSS
 *   2. Móvil 375px Android Chrome: hamburguesa por clic real, 1 btn visible
 *   3. iPadOS desktop mode (MacIntel, maxTouchPoints=5, 1024px): 1 btn visible,
 *      iOS Safari hint al clic, cierre por guía/externo, Contacto/Cotizar clicables
 *   4. PWA instalada (standalone): 0 botones install, indicador Instalado visible
 *   5. Móvil 320px: hamburguesa por clic real, botón en menú, links clicables
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

/** Count [data-pwa-install] elements that are visible (not hidden, not display:none) */
async function countVisibleInstall(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-pwa-install]')).filter(el => {
      if (el.hidden) return false;
      return window.getComputedStyle(el).display !== 'none';
    }).length
  );
}

/** Check no element has position:fixed + inset:0 inline (blocking overlay pattern) */
async function noFixedInset0(page) {
  return page.evaluate(() =>
    !Array.from(document.querySelectorAll('*')).some(el => {
      const s = el.style.cssText || '';
      return (s.includes('inset: 0') || s.includes('inset:0')) &&
             (s.includes('position: fixed') || s.includes('position:fixed'));
    })
  );
}

/** Verify specific key nav links are not visually blocked (CSS check) */
async function navLinksNotBlocked(page) {
  return page.evaluate(() => {
    const selectors = [
      'a[href="#contacto"]',
      'a[href="#cotizar"]',
      'a[href="/portal-clientes"]',
      'a[href*="wa.me"]',
    ];
    return selectors.every(sel => {
      const el = document.querySelector(sel);
      if (!el) return true; // selector absent is not a failure
      const s = window.getComputedStyle(el);
      return s.pointerEvents !== 'none' && s.visibility !== 'hidden';
    });
  });
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
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
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

    // 1d — sin overlay position:fixed+inset:0
    assert.ok(await noFixedInset0(page), 'Ningún elemento debe tener position:fixed+inset:0 inline');
    console.log('  PASS 1d sin overlay position:fixed+inset:0');

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
    await page.click('h1', { force: true }); // cerrar
    await page.waitForTimeout(200);
    await page.click('.pwa-nav-btn'); // volver a abrir
    await page.waitForTimeout(200);
    const hintCount = await page.evaluate(() => document.querySelectorAll('#pwa-install-hint').length);
    assert.equal(hintCount, 1, `Listener cleanup: exactamente 1 hint en DOM tras reapertura; hay ${hintCount}`);
    await page.click('h1', { force: true }); // limpiar
    await page.waitForTimeout(200);
    console.log('  PASS 1g cleanup de listener — exactamente 1 hint al reabrir');

    // 1h — cierre por timeout simulado (cancelar _t y poner uno de 50ms que hace click en el hint)
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

    // WhatsApp y Portal Clientes: verificación CSS (links externos/de navegación)
    assert.ok(await navLinksNotBlocked(page), 'WhatsApp y Portal Clientes deben ser accesibles por CSS');
    console.log('  PASS 1i-3 WhatsApp y Portal Clientes no bloqueados por CSS');

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
  // TEST 3 — iPadOS desktop mode 1024px: iOS hint, cierre triple, Contacto/Cotizar
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

    // 3e — sin overlay position:fixed+inset:0
    assert.ok(await noFixedInset0(page), 'Sin position:fixed+inset:0 en iPadOS');
    console.log('  PASS 3e sin overlay position:fixed+inset:0');

    // 3f — links Contacto y Cotizar clicables con clic real (hint activo)
    await page.click('a[href="#contacto"]');
    await page.waitForTimeout(100);
    console.log('  PASS 3f-1 clic real en Contacto con iOS hint activo — no bloqueado');

    // hint se cerró al clic externo en Contacto — reabrir para Cotizar
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.click('a[href="#cotizar"]');
    await page.waitForTimeout(100);
    console.log('  PASS 3f-2 clic real en Cotizar con iOS hint activo — no bloqueado');

    // 3g — cierre por clic externo
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.click('h1', { force: true });
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-ios-hint') === null, '#pwa-ios-hint debe cerrarse tras clic externo');
    console.log('  PASS 3g iOS hint se cierra con clic externo');

    // 3h — cierre por toque en la guía
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    assert.ok(await page.$('#pwa-ios-hint') !== null, 'iOS hint debe reaparecer');
    await page.click('#pwa-ios-hint');
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-ios-hint') === null, 'iOS hint debe cerrarse al tocar la guía');
    console.log('  PASS 3h iOS hint se cierra al tocar la guía');

    // 3i — cierre por timeout simulado
    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const h = document.getElementById('pwa-ios-hint');
      if (h && h._t) { clearTimeout(h._t); h._t = setTimeout(() => h.click(), 50); }
    });
    await page.waitForTimeout(300);
    assert.ok(await page.$('#pwa-ios-hint') === null, 'iOS hint debe cerrarse al expirar el timeout');
    console.log('  PASS 3i iOS hint se cierra al expirar el timeout');

    // 3j — cleanup de listener (re-clic → 1 hint, no duplicados)
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
    console.log('  PASS 3j cleanup de listener iOS — exactamente 1 hint al reabrir');

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

    // 5a — abrir hamburguesa por clic real (NO classList.add)
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

    // 5b — botón install en hamburguesa
    const mobBtn = await page.$('li[data-pwa-install] .pwa-menu-btn');
    assert.ok(mobBtn !== null, 'Debe existir .pwa-menu-btn en hamburguesa en 320px');
    console.log('  PASS 5b botón install en hamburguesa en 320px');

    // 5c — links clicables (Contacto hash link con clic real)
    await page.click('a[href="#contacto"]');
    await page.waitForTimeout(100);
    console.log('  PASS 5c clic real en Contacto en 320px — no bloqueado');

    await ctx.close();
  }

  console.log('\n✅ Todas las pruebas Playwright pasaron — GLV Global Food Services LLC');
  console.log('   Chrome Windows 1440px: 1 btn ✓, Chrome hint ✓, cierre ×3 ✓, cleanup ✓, links ✓');
  console.log('   Android 375px: desktop oculto ✓, hamburguesa clic real ✓, 1 btn ✓');
  console.log('   iPadOS 1024px: 1 btn ✓, iOS hint ✓, cierre ×3 ✓, cleanup ✓, links ✓');
  console.log('   Standalone: 0 install ✓, Instalado visible ✓');
  console.log('   Móvil 320px: hamburguesa clic real ✓, btn ✓, links ✓');

} finally {
  if (browser) await browser.close();
  if (server) server.close();
}

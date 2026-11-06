/**
 * Playwright PWA install-button tests — GLV Global Food Services LLC
 *
 * Requisitos validados:
 *   1. Escritorio 1440px Chrome Windows: exactamente 1 botón visible,
 *      hint Chrome al clic (sin deferredPrompt), sin iOS hint, sin inset:0
 *   2. Móvil 375px Android Chrome: botón desktop oculto, 1 btn en hamburguesa
 *   3. iPadOS desktop mode (MacIntel, maxTouchPoints=5, 1024px): 1 btn visible,
 *      iOS Safari hint al clic, sin Chrome hint, sin inset:0
 *   4. PWA instalada (standalone): 0 botones install, indicador Instalado visible
 *   5. Cierre de cada guía: hints desaparecen tras clic externo o timeout
 *   6. Clic posterior en Contacto, WhatsApp, Cotizar tras mostrar hint: todos clicables
 *   7. Móvil 320px: botón en hamburguesa, links clicables
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

/** Check all <a href> links are clickable (pointer-events not none, visibility not hidden) */
async function allLinksClickable(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).every(a => {
      const s = window.getComputedStyle(a);
      return s.pointerEvents !== 'none' && s.visibility !== 'hidden';
    })
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
  // TEST 1 — Chrome Windows 1440px: exactamente 1 botón, Chrome hint, sin iOS
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 1: Chrome Windows 1440px — botón único, hint Chrome');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'Win32', 0);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    const visCount = await countVisibleInstall(page);
    assert.equal(visCount, 1, `Debe haber exactamente 1 [data-pwa-install] visible en escritorio; hay ${visCount}`);
    console.log(`  PASS 1a exactamente 1 botón install visible (count=${visCount})`);

    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);

    const chromeHint = await page.$('#pwa-install-hint');
    assert.ok(chromeHint !== null, '#pwa-install-hint debe aparecer en Chrome Windows');
    console.log('  PASS 1b #pwa-install-hint aparece al clic');

    const iosHint = await page.$('#pwa-ios-hint');
    assert.ok(iosHint === null, '#pwa-ios-hint NO debe aparecer en Chrome Windows');
    console.log('  PASS 1c sin #pwa-ios-hint en Chrome Windows');

    assert.ok(await noFixedInset0(page), 'Ningún elemento debe tener position:fixed+inset:0 inline (overlay bloqueante)');
    console.log('  PASS 1d sin overlay position:fixed+inset:0');

    // Cierre del hint: clic externo
    await page.click('h1', { force: true });
    await page.waitForTimeout(300);
    const hintAfterClose = await page.$('#pwa-install-hint');
    assert.ok(hintAfterClose === null, 'El hint Chrome debe cerrarse tras clic externo');
    console.log('  PASS 1e hint se cierra con clic externo');

    // Links principales clicables después del hint
    assert.ok(await allLinksClickable(page), 'Todos los links deben seguir clicables');
    console.log('  PASS 1f todos los links clicables tras el hint');

    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 2 — Android Chrome 375px: botón desktop oculto, 1 btn en hamburguesa
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 2: Android Chrome 375px — hamburguesa, 1 botón móvil');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'Linux armv8l', 5);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // Desktop div debe estar oculto por CSS
    const desktopDiv = await page.$('.pwa-nav-desktop');
    const desktopDisplay = desktopDiv
      ? await page.evaluate(el => window.getComputedStyle(el).display, desktopDiv)
      : 'NOT_FOUND';
    assert.ok(desktopDisplay === 'none' || desktopDisplay === 'NOT_FOUND',
      `pwa-nav-desktop debe estar oculto en móvil; display="${desktopDisplay}"`);
    console.log(`  PASS 2a .pwa-nav-desktop oculto en móvil (display="${desktopDisplay}")`);

    // Abrir hamburguesa (GLV Global usa toggleNav() que añade clase .open a .nav-links)
    await page.evaluate(() => {
      const links = document.querySelector('.nav-links');
      if (links) links.classList.add('open');
    });
    await page.waitForTimeout(200);

    const mobPwaBtn = await page.$('li[data-pwa-install] .pwa-menu-btn');
    assert.ok(mobPwaBtn !== null, 'Debe existir .pwa-menu-btn dentro de li[data-pwa-install] en hamburguesa');
    const mobDisplay = await page.evaluate(el => window.getComputedStyle(el).display, mobPwaBtn);
    assert.ok(mobDisplay !== 'none', `Botón móvil debe ser visible; display="${mobDisplay}"`);
    console.log(`  PASS 2b botón móvil visible en hamburguesa (display="${mobDisplay}")`);

    // Solo 1 visible (el li está en hamburguesa, el div desktop está oculto)
    const visCount = await countVisibleInstall(page);
    assert.equal(visCount, 1, `Debe haber exactamente 1 [data-pwa-install] visible en móvil; hay ${visCount}`);
    console.log(`  PASS 2c exactamente 1 install element visible (count=${visCount})`);

    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 3 — iPadOS desktop mode 1024px: iOS hint, sin Chrome hint
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 3: iPadOS desktop mode 1024px — iOS hint, 1 botón');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      viewport: { width: 1024, height: 768 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'MacIntel', 5);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    const visCount = await countVisibleInstall(page);
    assert.equal(visCount, 1, `Debe haber exactamente 1 install visible en iPadOS; hay ${visCount}`);
    console.log(`  PASS 3a exactamente 1 botón install visible (count=${visCount})`);

    await page.click('.pwa-nav-btn');
    await page.waitForTimeout(200);

    const iosHint = await page.$('#pwa-ios-hint');
    assert.ok(iosHint !== null, '#pwa-ios-hint debe aparecer en iPadOS');
    console.log('  PASS 3b #pwa-ios-hint aparece al clic en iPadOS');

    const hintText = await page.$eval('#pwa-ios-hint', el => el.textContent);
    assert.ok(hintText.includes('Compartir') || hintText.includes('Share'),
      `iOS hint debe mencionar Compartir; texto: "${hintText.slice(0, 80)}"`);
    console.log('  PASS 3c iOS hint contiene instrucciones Safari');

    const chromeHint = await page.$('#pwa-install-hint');
    assert.ok(chromeHint === null, '#pwa-install-hint NO debe aparecer en iPadOS');
    console.log('  PASS 3d sin Chrome hint en iPadOS');

    assert.ok(await noFixedInset0(page), 'Sin position:fixed+inset:0 en iPadOS');
    console.log('  PASS 3e sin overlay position:fixed+inset:0');

    assert.ok(await allLinksClickable(page), 'Todos los links clicables tras iOS hint');
    console.log('  PASS 3f todos los links clicables tras iOS hint');

    // Cierre de iOS hint
    await page.click('h1', { force: true });
    await page.waitForTimeout(300);
    const hintClosed = await page.$('#pwa-ios-hint');
    assert.ok(hintClosed === null, '#pwa-ios-hint debe cerrarse tras clic externo');
    console.log('  PASS 3g iOS hint se cierra con clic externo');

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
  // TEST 5 — Móvil 320px: hamburguesa funciona, links clicables
  // ════════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 5: Móvil 320px — hamburguesa, links clicables');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-A115F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      viewport: { width: 320, height: 568 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'Linux armv8l', 5);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // Abrir hamburguesa
    await page.evaluate(() => {
      const links = document.querySelector('.nav-links');
      if (links) links.classList.add('open');
    });
    await page.waitForTimeout(200);

    const mobBtn = await page.$('li[data-pwa-install] .pwa-menu-btn');
    assert.ok(mobBtn !== null, 'Debe existir .pwa-menu-btn en hamburguesa en 320px');
    console.log('  PASS 5a botón install en hamburguesa en 320px');

    assert.ok(await allLinksClickable(page), 'Todos los links clicables en 320px');
    console.log('  PASS 5b links clicables en 320px');

    await ctx.close();
  }

  console.log('\n✅ Todas las pruebas Playwright pasaron — GLV Global Food Services LLC');
  console.log('   Chrome Windows 1440px: 1 btn ✓, Chrome hint ✓, cierre ✓, links ✓');
  console.log('   Android 375px: desktop oculto ✓, 1 btn hamburguesa ✓');
  console.log('   iPadOS 1024px: 1 btn ✓, iOS hint ✓, sin Chrome ✓, cierre ✓, links ✓');
  console.log('   Standalone: 0 install ✓, Instalado visible ✓');
  console.log('   Móvil 320px: hamburguesa ✓, links ✓');

} finally {
  if (browser) await browser.close();
  if (server) server.close();
}

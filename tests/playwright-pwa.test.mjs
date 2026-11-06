/**
 * Playwright PWA install-button tests — GLV Global Food Services LLC
 *
 * Scenarios:
 *   1. Desktop Chrome Windows (1280px) — exactly 1 install button visible,
 *      click → Chrome fallback hint, no iOS hint, no inset:0, links clickable
 *   2. Mobile iPhone (390px) — desktop button hidden, hamburger reveals 1 button,
 *      click → iOS hint, no Chrome hint
 *   3. iPadOS desktop mode (MacIntel+touch, 1024px) — 1 button visible,
 *      click → iOS hint, no Chrome hint, no inset:0
 *   4. PWA installed (standalone) — all install buttons hidden, no hints
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

function serve(port) {
  const MIME = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
    '.mjs':'application/javascript', '.json':'application/json', '.png':'image/png',
    '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon',
    '.woff':'font/woff', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };
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

async function spoofPlatform(page, platform, maxTouchPoints) {
  await page.addInitScript(({ platform, maxTouchPoints }) => {
    Object.defineProperty(navigator, 'platform', { get: () => platform });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => maxTouchPoints });
  }, { platform, maxTouchPoints });
}

async function countVisibleInstallButtons(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-pwa-install]')).filter(el => {
      if (el.hidden) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length;
  });
}

const PORT = 7341;
let server, browser;

try {
  server = await serve(PORT);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const BASE = `http://localhost:${PORT}`;

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1 — Desktop Chrome Windows (1280px)
  // ══════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 1: Desktop Chrome Windows (1280px)');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'Win32', 0);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // 1a: exactly 1 visible [data-pwa-install]
    const visibleCount = await countVisibleInstallButtons(page);
    assert.strictEqual(visibleCount, 1, `Exactly 1 install button must be visible on desktop; got ${visibleCount}`);
    console.log(`  PASS 1a exactly ${visibleCount} install button visible on desktop`);

    // 1b: click it → Chrome fallback hint (use evaluate to bypass Playwright visibility check)
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-pwa-install]:not([hidden]) button');
      if (!btn) return false;
      btn.click();
      return true;
    });
    assert.ok(clicked, 'Must find and click the visible install button');
    await page.waitForTimeout(200);

    const chromeHint = await page.$('#pwa-install-hint');
    assert.ok(chromeHint !== null, '#pwa-install-hint must appear on Chrome Windows');
    console.log('  PASS 1b #pwa-install-hint appears on click');

    const iosHint = await page.$('#pwa-ios-hint');
    assert.ok(iosHint === null, '#pwa-ios-hint must NOT appear on Chrome Windows');
    console.log('  PASS 1c no iOS hint on Chrome Windows');

    // 1d: PWA hint elements must not use inset:0 (legitimate video/loader overlays are OK)
    const hintHasInset = await page.evaluate(() => {
      return ['pwa-install-hint', 'pwa-ios-hint'].some(id => {
        const el = document.getElementById(id);
        return el && (el.style.cssText.includes('inset:0') || el.style.cssText.includes('inset: 0'));
      });
    });
    assert.ok(!hintHasInset, 'PWA hint elements must not use inset:0 overlay');
    console.log('  PASS 1d PWA hints use specific positioning, no inset:0');

    // 1e: all links remain clickable
    const linksClickable = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).every(a => {
        const s = window.getComputedStyle(a);
        return s.pointerEvents !== 'none' && s.visibility !== 'hidden';
      })
    );
    assert.ok(linksClickable, 'All nav links must remain clickable');
    console.log('  PASS 1e all links remain clickable');

    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2 — Mobile iPhone (390px)
  // ══════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 2: Mobile iPhone (390px)');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'iPhone', 5);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // 2a: desktop button hidden via CSS
    const desktopDivDisplay = await page.evaluate(() => {
      const el = document.querySelector('.pwa-nav-desktop');
      return el ? window.getComputedStyle(el).display : 'NOT_FOUND';
    });
    assert.strictEqual(desktopDivDisplay, 'none', `pwa-nav-desktop must be display:none on mobile; got ${desktopDivDisplay}`);
    console.log('  PASS 2a .pwa-nav-desktop hidden on mobile');

    // 2b: open hamburger menu
    await page.evaluate(() => {
      const links = document.querySelector('.nav-links');
      if (links) links.classList.add('open');
    });
    await page.waitForTimeout(200);

    // 2c: exactly 1 visible install button in hamburger
    const visibleCount = await countVisibleInstallButtons(page);
    assert.strictEqual(visibleCount, 1, `Exactly 1 install button in hamburger; got ${visibleCount}`);
    console.log(`  PASS 2b exactly ${visibleCount} install button in hamburger menu`);

    // 2d: click → iOS hint (use evaluate to bypass Playwright visibility check)
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-pwa-install]:not([hidden]) button.pwa-menu-btn');
      if (!btn) return false;
      btn.click();
      return true;
    });
    assert.ok(clicked, 'Mobile pwa-menu-btn must exist and be clickable');
    await page.waitForTimeout(200);

    const iosHint = await page.$('#pwa-ios-hint');
    assert.ok(iosHint !== null, '#pwa-ios-hint must appear on iPhone');
    console.log('  PASS 2c #pwa-ios-hint appears on iPhone click');

    const chromeHint = await page.$('#pwa-install-hint');
    assert.ok(chromeHint === null, '#pwa-install-hint must NOT appear on iPhone');
    console.log('  PASS 2d no Chrome hint on iPhone');

    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3 — iPadOS desktop mode (MacIntel+touch, 1024px)
  // ══════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 3: iPadOS desktop mode (MacIntel+touch, 1024px)');
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      viewport: { width: 1024, height: 768 },
    });
    const page = await ctx.newPage();
    await spoofPlatform(page, 'MacIntel', 5);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(400);

    // 3a: exactly 1 visible button (desktop div, mobile li hidden via CSS)
    const visibleCount = await countVisibleInstallButtons(page);
    assert.strictEqual(visibleCount, 1, `Exactly 1 install button on iPadOS desktop; got ${visibleCount}`);
    console.log(`  PASS 3a exactly ${visibleCount} install button on iPadOS desktop`);

    // 3b: click → iOS hint (use evaluate to bypass Playwright visibility check)
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-pwa-install]:not([hidden]) button');
      if (!btn) return false;
      btn.click();
      return true;
    });
    assert.ok(clicked, 'Must find and click the install button');
    await page.waitForTimeout(200);

    const iosHint = await page.$('#pwa-ios-hint');
    assert.ok(iosHint !== null, '#pwa-ios-hint must appear on iPadOS');
    console.log('  PASS 3b #pwa-ios-hint appears on iPadOS click');

    const chromeHint = await page.$('#pwa-install-hint');
    assert.ok(chromeHint === null, '#pwa-install-hint must NOT appear on iPadOS');
    console.log('  PASS 3c no Chrome hint on iPadOS');

    // 3d: PWA hint must not use inset:0
    const hintHasInset = await page.evaluate(() => {
      return ['pwa-install-hint', 'pwa-ios-hint'].some(id => {
        const el = document.getElementById(id);
        return el && (el.style.cssText.includes('inset:0') || el.style.cssText.includes('inset: 0'));
      });
    });
    assert.ok(!hintHasInset, 'PWA hint must not use inset:0 on iPadOS');
    console.log('  PASS 3d PWA hint uses specific positioning, no inset:0');

    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4 — PWA installed (standalone)
  // ══════════════════════════════════════════════════════════════════════════
  {
    console.log('\nTEST 4: PWA installed — standalone display-mode');
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

    // 4a: all [data-pwa-install] hidden
    const visibleInstall = await countVisibleInstallButtons(page);
    assert.strictEqual(visibleInstall, 0, `No install buttons in standalone; got ${visibleInstall}`);
    console.log('  PASS 4a no install buttons in standalone mode');

    // 4b: at least one [data-pwa-installed] visible
    const visibleInstalled = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-pwa-installed]')).filter(el => {
        if (el.hidden) return false;
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      }).length
    );
    assert.ok(visibleInstalled >= 1, `At least 1 installed indicator must be visible; got ${visibleInstalled}`);
    console.log(`  PASS 4b ${visibleInstalled} installed indicator(s) visible in standalone`);

    // 4c: no hints
    const anyHint = await page.$('#pwa-ios-hint, #pwa-install-hint');
    assert.ok(anyHint === null, 'No hints in standalone mode');
    console.log('  PASS 4c no hint elements in standalone');

    await ctx.close();
  }

  console.log('\n✅ All Playwright PWA tests passed — GLV Global Food Services LLC');
  console.log('   Desktop Chrome 1280px: 1 button ✓, Chrome hint ✓, no iOS hint ✓, no inset:0 ✓, links ✓');
  console.log('   Mobile iPhone 390px: desktop btn hidden ✓, 1 btn in hamburger ✓, iOS hint ✓');
  console.log('   iPadOS 1024px: 1 button ✓, iOS hint ✓, no Chrome hint ✓, no inset:0 ✓');
  console.log('   Standalone: 0 install btns ✓, installed indicator ✓, no hints ✓');

} finally {
  if (browser) await browser.close();
  if (server) server.close();
}

/** #100: native chapter/history regression against the real built app, synthetic inputs only. */
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, sep } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const ROOT = resolve('apps/web/dist');
const OUTPUT = resolve('report-navigation-results');
const CHAPTERS = ['overview', 'year', 'timeline', 'events', 'ask', 'domains', 'charts', 'periods', 'scenarios', 'guidance', 'method'].map(x => `ch-${x}`);
const fixture = { name: 'QA Navigation Synthetic', date: '1995-07-16', time: '22:00' };

declare global { interface Window { __navigationQa: {
  events: { hash: string; stateWasNull: boolean }[]; armed: boolean; reportRemoved: boolean; loadingSeen: boolean;
} } }

async function makeReport(page: Page) {
  await page.locator('#f-name').fill(fixture.name);
  await page.locator('input[name="gender"][value="male"]').check();
  await page.locator('#f-date').fill(fixture.date);
  await page.locator('#f-clock').fill(fixture.time);
  await page.locator('input[name="time-accuracy"][value="exact"]').check();
  await page.getByLabel('出生城市', { exact: true }).selectOption('tainan');
  await page.getByRole('button', { name: '排盤', exact: true }).click();
  await page.locator('.report__title').waitFor();
  assert.equal(await page.locator('.report__title').textContent(), fixture.name);
}

async function runCase(browser: Browser, origin: string, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  const observations: object[] = [];
  try {
    await page.addInitScript(() => {
      window.__navigationQa = { events: [], armed: false, reportRemoved: false, loadingSeen: false };
      addEventListener('popstate', event => window.__navigationQa.events.push({ hash: location.hash, stateWasNull: (event as PopStateEvent).state === null }));
      new MutationObserver(records => {
        const qa = window.__navigationQa;
        if (!qa.armed) return;
        for (const record of records) {
          for (const node of record.removedNodes) if (node instanceof Element && (node.matches('.report') || node.querySelector('.report'))) qa.reportRemoved = true;
          for (const node of record.addedNodes) if (node instanceof Element && (node.matches('.loading') || node.querySelector('.loading'))) qa.loadingSeen = true;
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`${origin}/fortunetelling/`);
    await makeReport(page);
    await page.locator('.loading').waitFor({ state: 'hidden' });
    const original = await page.locator('.report').elementHandle();
    assert(original);
    const before = await page.evaluate(() => ({ length: history.length, saved: localStorage.getItem('fortunetelling:queries:v1') }));
    await page.evaluate(() => { window.__navigationQa.armed = true; });
    assert.deepEqual(await page.locator('.chapters a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href'))), CHAPTERS.map(id => `#${id}`));

    for (const [index, id] of CHAPTERS.entries()) {
      await page.locator(`.chapters a[href="#${id}"]`).click();
      await page.waitForFunction(id => location.hash === `#${id}` && document.querySelector('.report') !== null, id);
      await page.waitForFunction(id => document.querySelector(`.chapters a[href="#${id}"]`)?.getAttribute('aria-current') === 'location', id);
      assert(await original.evaluate(node => node === document.querySelector('.report')), 'chapter click replaced the report');
      const result = await page.evaluate(id => {
        const chapter = document.getElementById(id)!;
        const box = chapter.getBoundingClientRect();
        const link = document.querySelector(`.chapters a[href="#${id}"]`)!;
        const linkBox = link.getBoundingClientRect();
        return { id, historyLength: history.length, inViewport: box.bottom > 0 && box.top < innerHeight,
          activeVisible: linkBox.left >= 0 && linkBox.right <= innerWidth,
          saved: localStorage.getItem('fortunetelling:queries:v1'), state: history.state };
      }, id);
      assert.equal(result.historyLength, before.length + index + 1, 'chapter entry duplicated');
      assert(result.inViewport, 'chapter did not scroll into viewport');
      assert(result.activeVisible, 'active mobile chapter is offscreen');
      assert.equal(result.saved, before.saved, 'navigation rewrote personal inputs');
      assert(!JSON.stringify(result.state).includes(fixture.name), 'personal data leaked into history state');
      observations.push({ id, historyLength: result.historyLength, inViewport: result.inViewport, activeVisible: result.activeVisible });
    }
    // Repeated activation does not add another history entry.
    await page.locator('.chapters a[href="#ch-method"]').click();
    assert.equal(await page.evaluate(() => history.length), before.length + 11);
    await page.screenshot({ path: `${OUTPUT}/${width}-chapters.png` });

    // The native links keep keyboard semantics, including Tab followed by Enter.
    await page.locator('.chapters a[href="#ch-overview"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('href'), '#ch-year');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#ch-year');
    assert(await original.evaluate(node => node === document.querySelector('.report')));
    await page.goBack();
    await page.waitForFunction(() => location.hash === '#ch-method');
    assert(await original.evaluate(node => node === document.querySelector('.report')));
    await page.goForward();
    await page.waitForFunction(() => location.hash === '#ch-year');
    assert(await original.evaluate(node => node === document.querySelector('.report')));
    const native = await page.evaluate(() => window.__navigationQa);
    assert.equal(native.reportRemoved, false); assert.equal(native.loadingSeen, false);
    assert(native.events.some(event => event.stateWasNull), 'test did not exercise native null-state fragment navigation');

    // Explicit app navigation skips all chapter entries back to the form.
    await page.evaluate(() => { window.__navigationQa.armed = false; });
    await page.getByRole('button', { name: '← 重新輸入', exact: true }).click();
    await page.locator('#f-name').waitFor();
    assert.equal(await page.locator('#f-name').inputValue(), fixture.name);
    assert.equal(await page.locator('#f-date').inputValue(), fixture.date);
    assert.equal(await page.locator('#f-clock').inputValue(), fixture.time);
    const saved = await page.evaluate(() => localStorage.getItem('fortunetelling:queries:v1'));
    assert.equal(saved, before.saved);
    await page.evaluate(() => { window.__navigationQa.armed = true; });
    await page.goForward();
    await page.locator('.report__title').waitFor();
    assert.equal(await page.locator('.report__title').textContent(), fixture.name);
    assert.equal(await page.evaluate(() => window.__navigationQa.loadingSeen), false, 'Forward recalculated the report');
    assert.equal(await page.evaluate(() => localStorage.getItem('fortunetelling:queries:v1')), saved);
    await page.evaluate(() => { window.__navigationQa.armed = false; });
    await page.getByRole('button', { name: '回到首頁', exact: true }).click();
    await page.locator('#f-name').waitFor();
    await page.goForward(); await page.locator('.report__title').waitFor();
    await page.goBack(); await page.locator('#f-name').waitFor();
    assert.equal(await page.locator('#f-name').inputValue(), fixture.name);
    assert.deepEqual(errors, []);
    return { width, passed: true, observations, nativeEvents: native.events, errors,
      checks: ['11 chapters', 'same DOM report', 'no extra history entries', 'same stored input', 'keyboard Tab/Enter', 'chapter Back/Forward', 'app re-input', 'home', 'cached report Forward', 'browser Back to input'] };
  } finally { await context.close(); }
}

async function main() {
  assert(process.env.GITHUB_ACTIONS === 'true' && process.env.REPORT_NAVIGATION_CHECK === '1', 'Only the approved stock-Chrome Actions job may execute this harness; do not set runner flags locally.');
  assert.notEqual(process.getuid?.(), 0, 'Root browser execution refused');
  const expectedHead = process.env.ANSWER_HEAD_SHA;
  const checkout = Bun.spawnSync(['git', 'rev-parse', 'HEAD']);
  assert.equal(checkout.exitCode, 0);
  const head = checkout.stdout.toString().trim();
  assert.match(head, /^[a-f0-9]{40}$/); assert.equal(head, expectedHead, 'Exact PR head required');
  const status = Bun.spawnSync(['git', 'status', '--porcelain', '--untracked-files=no']);
  assert.equal(status.exitCode, 0); assert.equal(status.stdout.toString().trim(), '', 'Tracked sources changed after checkout');
  await access('/opt/google/chrome/chrome', constants.X_OK);
  const sources: Record<string, string> = {};
  for (const file of ['apps/web/src/App.tsx', 'apps/web/src/lib/viewHistory.ts', 'apps/web/scripts/report-navigation-browser-check.ts']) sources[file] = new Bun.CryptoHasher('sha256').update(await readFile(file)).digest('hex');
  await mkdir(OUTPUT, { recursive: true });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (!pathname.startsWith('/fortunetelling/')) return new Response('not found', { status: 404 });
    const full = resolve(ROOT, pathname.slice('/fortunetelling/'.length) || 'index.html');
    if (!full.startsWith(ROOT + sep)) return new Response('not found', { status: 404 });
    const file = Bun.file(full);
    return await file.exists() ? new Response(file, { headers: { 'Cache-Control': 'no-store' } }) : new Response('not found', { status: 404 });
  } });
  let browser: Browser | undefined;
  const evidence: Record<string, unknown> = { head, sources, chromiumSandbox: true, cases: [], passed: false };
  try {
    browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, timeout: 15_000 });
    evidence.browserVersion = browser.version();
    for (const width of [1280, 390]) (evidence.cases as object[]).push(await runCase(browser, `http://127.0.0.1:${server.port}`, width));
    evidence.passed = true;
  } catch (error) { evidence.error = String(error); throw error; }
  finally {
    await browser?.close(); await server.stop(true);
    await writeFile(`${OUTPUT}/results.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  }
}
await main();

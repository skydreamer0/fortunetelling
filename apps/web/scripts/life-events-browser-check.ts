import { createHash } from 'node:crypto';
import { serveFixture, fileResponse, runCommand } from './node-http.ts';
/** #59: local LifeEvents recovery against the real built app, synthetic inputs only. */
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, sep } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const ROOT = resolve('apps/web/dist');
const OUTPUT = resolve('life-event-results');
const fixture = { name: 'QA Navigation Synthetic', date: '1995-07-16', time: '22:00' };

declare global { interface Window { __lifeQa: { deny: boolean; denyRead: boolean } } }

async function makeReport(page: Page, date = fixture.date) {
  await page.locator('#f-name').fill(fixture.name);
  await page.locator('input[name="gender"][value="male"]').check();
  await page.locator('#f-date').fill(date);
  await page.locator('#f-clock').fill(fixture.time);
  await page.locator('input[name="time-accuracy"][value="exact"]').check();
  await page.getByLabel('出生城市', { exact: true }).selectOption('tainan');
  await page.getByRole('button', { name: '排盤', exact: true }).click();
  await page.locator('.report__title').waitFor();
  assert.equal(await page.locator('.report__title').textContent(), fixture.name);
}

async function runCase(browser: Browser, origin: string, width: number, cases: object[]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const record = { width, passed: false, assertions: [] as string[] };
  cases.push(record);
  const key = 'fortunetelling:life-events:v1';
  const rows = page.locator('.life__item');
  const row = (note: string) => rows.filter({ hasText: note });
  const assertRows = async (count: number) => { await page.waitForFunction(n => document.querySelectorAll('.life__item').length === n, count); assert.equal(await rows.count(), count); };
  const add = async (note: string) => {
    await page.locator('.life__form input[type=month]').fill('2026-06');
    await page.locator('.life__form input[type=text]').fill(note);
    await page.locator('.life__form button[type=submit]').click();
  };
  const raw = () => page.evaluate(k => localStorage.getItem(k), key);
  try {
    await page.addInitScript(() => {
      window.__lifeQa = { deny: false, denyRead: false };
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
      Storage.prototype.getItem = function(k) { if(k === 'fortunetelling:life-events:v1' && window.__lifeQa.denyRead) throw new DOMException('Synthetic read denial', 'SecurityError'); return get.call(this,k); };
      Storage.prototype.setItem = function(k,v) { if(k === 'fortunetelling:life-events:v1' && window.__lifeQa.deny) throw new DOMException('Synthetic quota', 'QuotaExceededError'); return set.call(this,k,v); };
      Storage.prototype.removeItem = function(k) { if(k === 'fortunetelling:life-events:v1' && window.__lifeQa.deny) throw new DOMException('Synthetic quota', 'QuotaExceededError'); return remove.call(this,k); };
    });
    await page.goto(`${origin}/fortunetelling/`); await makeReport(page);
    await page.locator('.life').scrollIntoViewIfNeeded();
    await add('saved-original'); await assertRows(1);
    const first = await raw(); assert(first);
    await row('saved-original').getByRole('button', {name: '編輯', exact: true}).click();
    await page.locator('.life__form input[type=text]').fill('saved-edited');
    await page.locator('.life__form button[type=submit]').click();
    assert((await raw())!.includes('saved-edited')); record.assertions.push('actual add/edit persisted');
    const beforeFailure = await raw();
    await page.evaluate(() => { window.__lifeQa.deny = true; });
    await row('saved-edited').getByRole('button',{name:'編輯',exact:true}).click();
    await page.locator('.life__form input[type=text]').fill('failed-edit-pending');
    await page.locator('.life__form button[type=submit]').click();
    await add('pending-a'); await add('pending-b'); await assertRows(3);
    assert.equal(await page.locator('.life__item[data-pending=true]').count(),3);
    await row('pending-a').getByRole('button',{name:'刪除',exact:true}).click(); await assertRows(2);
    assert(!(await raw())!.includes('pending-b')); record.assertions.push('failed additions visible and removable without persistence');
    await row('failed-edit-pending').getByRole('button',{name:'刪除',exact:true}).click();
    await assertRows(2); assert.equal(await raw(),beforeFailure);
    page.once('dialog',d=>d.accept()); await page.getByRole('button',{name:'刪除全部',exact:true}).click();
    await assertRows(1); assert.equal(await row('failed-edit-pending').count(),1);
    assert.equal(await raw(),beforeFailure);
    await add('pending-b'); await assertRows(2);
    record.assertions.push('failed edit stays visible; failed persisted delete/clear preserves disk and row');
    await page.evaluate(() => { window.__lifeQa.deny = false; });
    await page.getByRole('button',{name:'重試儲存',exact:true}).click();
    assert((await raw())!.includes('pending-b')); assert((await raw())!.includes('failed-edit-pending')); assert.equal(await page.locator('.life__item[data-pending=true]').count(),0);
    await page.reload(); await makeReport(page); await assertRows(2);
    assert.equal(await row('pending-b').count(),1); record.assertions.push('retry persists all pending and real reload restores');
    await page.reload(); await makeReport(page, '1995-07-17'); await assertRows(0);
    await page.reload(); await makeReport(page); await assertRows(2);
    record.assertions.push('different profile isolated; original profile restored');
    await row('pending-b').getByRole('button',{name:'刪除',exact:true}).click(); await assertRows(1);
    page.once('dialog', d => d.accept()); await page.getByRole('button',{name:'刪除全部',exact:true}).click(); await assertRows(0);
    assert.equal(await raw(),null); record.assertions.push('explicit single/all delete persisted');
    const opaque = JSON.stringify({version:99, profiles:{synthetic:{events:[],opaque:'keep'}}});
    await page.evaluate(({key,opaque}) => localStorage.setItem(key,opaque),{key,opaque});
    await page.reload(); await makeReport(page);
    await add('opaque-pending'); await assertRows(1); assert.equal(await raw(),opaque);
    await row('opaque-pending').getByRole('button',{name:'刪除',exact:true}).click(); await assertRows(0);
    assert.equal(await raw(),opaque); record.assertions.push('opaque envelope preserved byte-for-byte through real UI');
    await page.evaluate(({key,first}) => localStorage.setItem(key,first),{key,first});
    await page.reload(); await makeReport(page); await assertRows(1);
    await page.evaluate(() => { window.__lifeQa.denyRead = true; });
    await add('read-denied-pending'); await assertRows(2);
    await page.evaluate(() => { window.__lifeQa.denyRead = false; });
    assert.equal(await raw(),first);
    await page.getByRole('button',{name:'重試儲存',exact:true}).click();
    assert((await raw())!.includes('saved-original'));
    assert((await raw())!.includes('read-denied-pending'));
    record.assertions.push('read denial never overwrites original; recovery merges safely');
    record.passed = true;
  } finally { await context.close(); }
}

async function main() {
  assert(process.env.GITHUB_ACTIONS === 'true' && process.env.LIFE_EVENTS_CHECK === '1', 'Only the approved stock-Chrome Actions job may execute this harness; do not set runner flags locally.');
  assert.notEqual(process.getuid?.(), 0, 'Root browser execution refused');
  const expectedHead = process.env.ANSWER_HEAD_SHA;
  const checkout = runCommand(['git', 'rev-parse', 'HEAD']);
  assert.equal(checkout.exitCode, 0);
  const head = checkout.stdout.toString().trim();
  assert.match(head, /^[a-f0-9]{40}$/); assert.equal(head, expectedHead, 'Exact PR head required');
  const status = runCommand(['git', 'status', '--porcelain', '--untracked-files=no']);
  assert.equal(status.exitCode, 0); assert.equal(status.stdout.toString().trim(), '', 'Tracked sources changed after checkout');
  await access('/opt/google/chrome/chrome', constants.X_OK);
  const sources: Record<string, string> = {};
  for (const file of ['apps/web/src/lib/lifeEvents.ts', 'apps/web/src/lib/lifeEventSession.ts', 'apps/web/src/components/report/LifeEvents.tsx', 'apps/web/scripts/life-events-browser-check.ts']) sources[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  await mkdir(OUTPUT, { recursive: true });
  const server = await serveFixture({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (!pathname.startsWith('/fortunetelling/')) return new Response('not found', { status: 404 });
    const full = resolve(ROOT, pathname.slice('/fortunetelling/'.length) || 'index.html');
    if (!full.startsWith(ROOT + sep)) return new Response('not found', { status: 404 });
    return fileResponse(full);
  } });
  let browser: Browser | undefined;
  const evidence: Record<string, unknown> = { head, sources, chromiumSandbox: true, cases: [], passed: false };
  try {
    browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, timeout: 15_000 });
    evidence.browserVersion = browser.version();
    for (const width of [1280, 390]) await runCase(browser, `http://127.0.0.1:${server.port}`, width, evidence.cases as object[]);
    evidence.passed = true;
  } catch (error) { evidence.error = String(error); throw error; }
  finally {
    await browser?.close(); await server.stop(true);
    await writeFile(`${OUTPUT}/results.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  }
}
await main();

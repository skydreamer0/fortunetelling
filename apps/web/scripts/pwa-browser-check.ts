/**
 * GitHub-hosted CI only. Execute with Bun and the runner's stock Google Chrome.
 * Real Chrome Cache API + production worker, never an in-memory Cache mock.
 * This synthetic fixture does NOT certify the deployed UI or mobile PWA.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.PWA_BROWSER_CHECK !== '1') {
  throw new Error('Run only in the approved GitHub Actions job with PWA_BROWSER_CHECK=1.');
}

const output = resolve('pwa-browser-results');
await mkdir(output, { recursive: true });
const source = await readFile(new URL('../pwa/sw.js', import.meta.url), 'utf8');
const sourceSha256 = new Bun.CryptoHasher('sha256').update(source).digest('hex');
const playwrightVersion = (createRequire(import.meta.url)('playwright/package.json') as { version: string }).version;
const browserChannel = 'chrome';
const results: object[] = [];
const diagnostics: object[] = [];
const scope = '/fortunetelling/';
const stops = new Set<() => Promise<void>>();

function fixture(mode: 'production' | 'without-ignore-vary') {
  let revision = 'v1';
  let stopPromise: Promise<void> | undefined;
  const needle = 'ignoreSearch: true, ignoreVary: true';
  assert.equal(source.split(needle).length, 2, 'negative control must mutate exactly one cacheFirst option');
  const template = mode === 'production' ? source : source.replace(needle, 'ignoreSearch: true');
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      const headers = { 'Cache-Control': 'no-store' };
      if (path === `${scope}sw.js`) {
        const script = template.replace('__PWA_VERSION__', JSON.stringify(revision))
          .replace('__PWA_PRECACHE__', JSON.stringify(['./', 'index.html', 'lazy.js']));
        return new Response(script, { headers: { ...headers, 'Content-Type': 'text/javascript' } });
      }
      if (path === scope || path === `${scope}index.html`) {
        return new Response('<!doctype html><meta charset="utf-8"><title>Synthetic PWA regression</title><h1>Synthetic fixture</h1>',
          { headers: { ...headers, 'Content-Type': 'text/html' } });
      }
      if (path === `${scope}lazy.js`) {
        return new Response(`export const fixtureVersion = ${JSON.stringify(revision)};`, {
          headers: { ...headers, 'Content-Type': 'text/javascript', Vary: 'X-PWA-Variant' },
        });
      }
      return new Response('not found', { status: 404, headers });
    },
  });
  // Memoize the actual completion, including rejection. A failed stop must not
  // turn into a successful no-op on the next cleanup attempt.
  const stop = () => stopPromise ??= Promise.resolve().then(() => server.stop(true));
  stops.add(stop);
  return {
    url: `http://127.0.0.1:${server.port}${scope}`,
    update() { revision = 'v2'; },
    stop,
  };
}

async function check(browser: Browser, mode: 'production' | 'without-ignore-vary') {
  const host = fixture(mode);
  // A fresh nonpersistent context owns all workers/caches for this case.
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  context.setDefaultTimeout(15_000);
  const page = await context.newPage();
  let result: Record<string, unknown> = { mode, passed: false };
  page.on('console', message => diagnostics.push({ mode, console: message.type(), text: message.text() }));
  page.on('pageerror', error => diagnostics.push({ mode, pageerror: String(error) }));
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    await page.goto(host.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');

    const native = await page.evaluate(async () => {
      const url = new URL('lazy.js', location.href).href;
      const cache = await caches.open('fortune-precache-v1');
      const baseline = await cache.match(new Request(url));
      const variant = new Request(url, { headers: { 'X-PWA-Variant': 'dynamic-import-probe' } });
      return {
        vary: baseline?.headers.get('vary'),
        baseline: baseline ? await baseline.text() : null,
        strictMiss: (await cache.match(variant)) === undefined,
        ignoredHit: (await cache.match(variant, { ignoreVary: true })) !== undefined,
      };
    });
    assert.equal(native.vary, 'X-PWA-Variant');
    assert.equal(native.baseline, 'export const fixtureVersion = "v1";');
    assert.equal(native.strictMiss, true, 'fixture must truly differ under native Vary matching');
    assert.equal(native.ignoredHit, true);

    let update: unknown = null;
    if (mode === 'production') {
      await page.evaluate(async () => {
        (window as unknown as { pwaOldController: ServiceWorker | null }).pwaOldController = navigator.serviceWorker.controller;
        for (const name of ['fortune-runtime-v1', 'unrelated-app-cache']) {
          await (await caches.open(name)).put(new URL(`sentinel-${name}`, location.href).href, new Response(name));
        }
      });
      host.update();
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) throw new Error('registration missing');
        await registration.update();
      });
      await page.waitForFunction(async () => {
        const keys = await caches.keys();
        const active = (await navigator.serviceWorker.getRegistration())?.active;
        const controller = navigator.serviceWorker.controller;
        const old = (window as unknown as { pwaOldController: ServiceWorker | null }).pwaOldController;
        return keys.includes('fortune-precache-v2') && !keys.includes('fortune-precache-v1')
          && controller !== null && controller !== old && controller === active && active.state === 'activated';
      });
      update = await page.evaluate(async () => ({
        controllerReplaced: navigator.serviceWorker.controller !== (window as unknown as { pwaOldController: ServiceWorker | null }).pwaOldController,
        controllerIsActive: navigator.serviceWorker.controller === (await navigator.serviceWorker.getRegistration())?.active,
        keys: (await caches.keys()).sort(),
        current: await (await (await caches.open('fortune-precache-v2')).match(new URL('lazy.js', location.href).href))?.text(),
        sentinels: await Promise.all(['fortune-runtime-v1', 'unrelated-app-cache'].map(async name =>
          (await (await caches.open(name)).match(new URL(`sentinel-${name}`, location.href).href))?.text())),
      }));
      assert.deepEqual(update, {
        controllerReplaced: true,
        controllerIsActive: true,
        keys: ['fortune-precache-v2', 'fortune-runtime-v1', 'unrelated-app-cache'],
        current: 'export const fixtureVersion = "v2";',
        sentinels: ['fortune-runtime-v1', 'unrelated-app-cache'],
      });
    }

    // Both a real stopped server and browser offline mode; do not fake fetch responses.
    await host.stop();
    await context.setOffline(true);
    const offline = await page.evaluate(async () => {
      let body: string | null = null;
      let error: string | null = null;
      try {
        const response = await fetch('lazy.js', { headers: { 'X-PWA-Variant': 'dynamic-import-probe' }, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        body = await response.text();
      } catch (failure) { error = String(failure); }
      let uncachedFailed = false;
      try { await fetch('uncached-offline-probe', { cache: 'no-store' }); } catch { uncachedFailed = true; }
      return { body, error, uncachedFailed };
    });
    assert.equal(offline.uncachedFailed, true, 'uncached network must actually fail');
    if (mode === 'production') {
      assert.equal(offline.error, null);
      assert.equal(offline.body, 'export const fixtureVersion = "v2";');
      // Also exercise real dynamic module execution and cached navigation while offline.
      const imported = await page.evaluate(async () => (await import(new URL('lazy.js', location.href).href)).fixtureVersion);
      assert.equal(imported, 'v2');
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.title(), 'Synthetic PWA regression');
    } else {
      assert.equal(offline.body, null);
      assert.notEqual(offline.error, null, 'removing production ignoreVary must break the header-mismatch fetch');
    }
    result = { mode, native, update, offline, passed: true };
  } catch (error) {
    result = { mode, passed: false, error: String(error) };
    await page.screenshot({ path: resolve(output, `${mode}-failure.png`) }).catch(error => {
      diagnostics.push({ mode, screenshotFailure: String(error) });
    });
  } finally {
    const cleanupErrors: string[] = [];
    for (const [label, action] of [
      ['server.stop', () => host.stop()],
      ['trace.stop', () => context.tracing.stop({ path: resolve(output, `${mode}-trace.zip`) })],
      ['context.close', () => context.close()],
    ] as const) {
      try { await action(); }
      catch (error) { cleanupErrors.push(`${label}: ${String(error)}`); }
    }
    if (cleanupErrors.length) {
      result.passed = false;
      result.cleanupErrors = cleanupErrors;
    }
    // Record a case only after its trace and all cleanup have settled.
    results.push(result);
  }
  if (!result.passed) throw new Error(`${mode} failed; see results.json`);
}

let browser: Browser | undefined;
let passed = false;
let timedOut = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let timeoutCleanup: Promise<void> | undefined;
let browserVersion: string | null = null;
try {
  browser = await chromium.launch({ channel: browserChannel, timeout: 15_000, chromiumSandbox: true });
  browserVersion = browser.version();
  // Closing the browser cancels outstanding browser commands. Await the actual
  // checks below, rather than racing ahead and writing results while they run.
  timer = setTimeout(() => {
    timedOut = true;
    diagnostics.push({ fatal: 'PWA check exceeded 120 seconds; aborting browser commands' });
    timeoutCleanup = (async () => {
      const cleanup = await Promise.allSettled([...stops].map(stop => stop()).concat(browser!.close()));
      for (const entry of cleanup) if (entry.status === 'rejected') {
        diagnostics.push({ timeoutCleanup: String(entry.reason) });
      }
    })();
  }, 120_000);
  await check(browser, 'production');
  if (timedOut) throw new Error('Deadline exceeded');
  await check(browser, 'without-ignore-vary');
  if (timedOut) throw new Error('Deadline exceeded');
  passed = true;
} catch (error) {
  diagnostics.push({ fatal: String(error) });
  process.exitCode = 1;
} finally {
  if (timer) clearTimeout(timer);
  await timeoutCleanup;
  for (const stop of stops) {
    try { await stop(); }
    catch (error) {
      diagnostics.push({ cleanup: `server.stop: ${String(error)}` });
      passed = false;
      process.exitCode = 1;
    }
  }
  await browser?.close().catch(error => {
    diagnostics.push({ cleanup: String(error) });
    passed = false;
    process.exitCode = 1;
  });
  await writeFile(resolve(output, 'results.json'), JSON.stringify({
    passed, sourceSha256, commit: process.env.GITHUB_SHA ?? null,
    headCommit: process.env.PWA_HEAD_SHA ?? null,
    bun: Bun.version, playwrightVersion, browserVersion, browserChannel, chromiumSandbox: true,
    runner: { imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null },
    timedOut, scope: 'synthetic stock Chrome Cache API and production worker only',
    results, diagnostics,
  }, null, 2));
}

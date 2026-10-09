import { expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

test('the real Vite production bridge reads the iztro language instance, not its CJS wrapper', async () => {
  const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const output = await mkdtemp(join(tmpdir(), 'fortune-cooperative-bundle-'));
  try {
    // Use the real app configuration, including its chunk splitting. This is
    // module interoperability under Bun, not browser/input acceptance.
    await build({ root: web, configFile: join(web, 'vite.config.ts'), logLevel: 'silent',
      build: { outDir: output, emptyOutDir: true } });
    const candidates: string[] = [];
    for (const file of await readdir(join(output, 'assets'))) {
      if (!/^core-.*\.js$/.test(file)) continue;
      const path = join(output, 'assets', file);
      if ((await readFile(path, 'utf8')).includes('buildTimelineCooperatively:')) candidates.push(path);
    }
    expect(candidates).toHaveLength(1);
    const module = await import(pathToFileURL(candidates[0]).href);
    const bridges = Object.values(module).filter((value: any) =>
      typeof value?.analyze === 'function' && typeof value?.buildTimelineCooperatively === 'function');
    expect(bridges).toHaveLength(1);
    const core = bridges[0] as any;
    const report = core.analyze({ name: 'Synthetic bundle interoperability QA', year: 1995, month: 7, day: 16,
      hour: 22, minute: 0, timeKnown: true, gender: 'male', calendarType: 'solar', cityId: 'tainan', timeAccuracy: 'exact' });
    const options = { asOf: '2021-01-01', years: 1, includeMonths: true, topSignalsPerDomain: Infinity,
      systems: ['bazi', 'ziwei', 'numerology'], useTrueSolarTime: true, ziHourConvention: 'late' };
    const expected = core.buildTimeline(report.timeContext, options);
    let units = 0;
    const actual = await core.buildTimelineCooperatively(report.timeContext, options,
      { signal: new AbortController().signal, yieldTask: async () => { units++; } }).catch((error: unknown) => {
        // Avoid printing the entire minified source line on a regression.
        throw new Error(`Production cooperative bridge rejected: ${String(error)}`);
      });
    expect(actual.months).toHaveLength(12);
    expect(units).toBeGreaterThan(60);
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}, 20_000);

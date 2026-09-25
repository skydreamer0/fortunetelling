/**
 * Report Schema v4（V1-14, D-032）：timeContext／signals／timeline 與
 * 八字／紫微改用 TimeContext 後的黃金行為變更。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  BirthData,
  REPORT_SCHEMA_VERSION,
  buildConsensus,
  createDefaultRegistry,
  ZiweiEngine,
} from '../src/index';
import type { AnalyzeInput, Report } from '../src/core/analyze';

const AS_OF = '2026-07-11';
// analyze() takes ~1 s since v4 (sync timeline); several tests run multiple reports.
const SLOW = { timeout: 60_000 };

const engine = (report: Report, id: string) => report.engines.find(e => e.engineId === id)!;
const comp = (report: Report, engineId: string, id: string) => engine(report, engineId).components.find(c => c.id === id)?.value;
const natal = (report: Report) => {
  const { convention: _c, ...p } = comp(report, 'bazi', 'natal');
  return p;
};

const RUNTIME_KEYS = new Set(['generatedAt', 'computedAt', 'durationMs', 'classifiedAt', 'exportedAt']);
function stable(report: Report) {
  const copy = structuredClone(report);
  const strip = (v: any): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(strip);
    for (const k of Object.keys(v)) {
      if (RUNTIME_KEYS.has(k)) delete v[k];
      else strip(v[k]);
    }
  };
  strip(copy);
  return copy;
}

// ─── Golden behaviour changes ───────────────────────────────────────────────

test('Taipei 2026-02-15 13:03 → 真太陽時 12:55 → 時柱 壬午（民用時 13:03 為 癸未）', SLOW, () => {
  const input: AnalyzeInput = { year: 2026, month: 2, day: 15, hour: 13, minute: 3, gender: 'male' };
  const report = analyze(input, { asOf: AS_OF });
  assert.equal(report.timeContext.solar!.trueSolarIso, '2026-02-15T12:55:07');
  assert.deepEqual(natal(report), { year: '丙午', month: '庚寅', day: '庚申', time: '壬午' });
  assert.equal(comp(report, 'bazi', 'natal').convention.trueSolarTime, true);

  const civil = analyze({ ...input, useTrueSolarTime: false }, { asOf: AS_OF });
  assert.equal(natal(civil).time, '癸未');
  assert.equal(comp(civil, 'bazi', 'natal').convention.trueSolarTime, false);
});

test('23:30 出生：紫微用晚子（timeIndex 12），v3 誤用同日早子', SLOW, () => {
  const input: AnalyzeInput = { year: 1990, month: 6, day: 15, hour: 23, minute: 30, gender: 'female' };
  const report = analyze(input, { asOf: AS_OF });
  const ziwei = engine(report, 'ziwei');
  assert.equal(ziwei.meta.time, '晚子時');
  assert.equal(ziwei.meta.timeConvention.timeIndex, 12);
  assert.equal(ziwei.meta.timeConvention.iztroDate, '1990-06-15');

  // v3 engine path (legacy BirthData.timeIndex) gave 早子 of the same civil date.
  const legacy = new ZiweiEngine({ asOf: new Date(AS_OF) }).run(new BirthData(input as any));
  assert.equal(legacy.meta.time, '早子時');
  assert.notDeepEqual(ziwei.components, legacy.components);

  // useTrueSolarTime:false still fixes 晚子 (the civil clock reads 23:30 too).
  const civil = analyze({ ...input, useTrueSolarTime: false }, { asOf: AS_OF });
  assert.equal(engine(civil, 'ziwei').meta.time, '晚子時');

  // 子初換日（early）：23:00 起算次日早子
  const early = analyze({ ...input, ziHourConvention: 'early' }, { asOf: AS_OF });
  assert.equal(engine(early, 'ziwei').meta.timeConvention.iztroDate, '1990-06-16');
  assert.equal(engine(early, 'ziwei').meta.timeConvention.timeIndex, 0);
  assert.notEqual(natal(early).day, natal(report).day, 'bazi early convention moves the day pillar');
  assert.equal(report.timeContext.conventions.ziHourConvention, 'late');
  assert.equal(early.timeContext.conventions.ziwei.ziHourConvention, 'nextDayAt23');
});

test('New York 2026-03-05 12:00（驚蟄 13:59Z 之後）→ 月柱 辛卯（v3 以 UTC+8 牆鐘比對得 庚寅）', SLOW, () => {
  const report = analyze(
    { year: 2026, month: 3, day: 5, hour: 12, minute: 0, gender: 'male', cityId: 'new-york' },
    { asOf: AS_OF },
  );
  assert.equal(report.timeContext.utc!.iso, '2026-03-05T17:00:00Z');
  assert.equal(report.timeContext.profile.birthplace.timezone, 'America/New_York');
  assert.equal(report.timeContext.conventions.birthplaceSource, 'cityId');
  assert.equal(natal(report).month, '辛卯');
  assert.equal(natal(report).year, '丙午');
  const tc = engine(report, 'bazi').meta.timeConvention;
  assert.equal(tc.engineWallClockPillars.month, '庚寅');
  assert.deepEqual(tc.overriddenFields, ['month']);
  // 大運 follow the corrected month pillar (丙午 陽年男 → 順：壬辰 …)
  assert.equal(comp(report, 'bazi', 'daYun_1').ganZhi, '壬辰');
  assert.deepEqual(engine(report, 'bazi').errors, []);
});

test('流年以立春分年：asOf 2027-01-15 → { year: 2026, 丙午 }；立春後 → { 2027, 丁未 }', SLOW, () => {
  const input: AnalyzeInput = { year: 1990, month: 6, day: 15, hour: 10, minute: 30, gender: 'female' };
  assert.deepEqual(comp(analyze(input, { asOf: '2027-01-15' }), 'bazi', 'liuNian'), { year: 2026, ganZhi: '丙午' });
  assert.deepEqual(comp(analyze(input, { asOf: '2027-02-10' }), 'bazi', 'liuNian'), { year: 2027, ganZhi: '丁未' });
});

test('useTrueSolarTime:false 對非邊界台北出生重現 v3 引擎全部部件（parity）', SLOW, () => {
  for (const input of [
    { year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female', name: 'Test Person' },
    { year: 1986, month: 5, day: 29, hour: 8, minute: 0, gender: 'male', name: 'Golden Vector 1986' },
    { year: 2001, month: 12, day: 24, hour: 18, minute: 40, gender: 'female', name: '' },
  ] as AnalyzeInput[]) {
    const report = analyze({ ...input, useTrueSolarTime: false }, { asOf: AS_OF });
    const v3 = createDefaultRegistry({ asOf: new Date(AS_OF) }).runAll(new BirthData(input as any));
    assert.deepEqual(report.engines.map(e => e.engineId), v3.map(e => e.engineId));
    for (const [i, e] of report.engines.entries()) {
      assert.deepEqual(e.components, v3[i].components, `${input.year}/${e.engineId}`);
      assert.deepEqual(e.errors, v3[i].errors, `${input.year}/${e.engineId}`);
    }
  }
});

// ─── v4 fields ──────────────────────────────────────────────────────────────

test('timeContext：profile 不含姓名、保留出生地標籤，附 conventions', SLOW, () => {
  const report = analyze(
    { year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female', name: 'Mei Lin', cityId: 'tainan' },
    { asOf: AS_OF },
  );
  const { timeContext } = report;
  assert.equal('name' in timeContext.profile, false);
  assert.equal(JSON.stringify(timeContext).includes('Mei Lin'), false);
  assert.equal(timeContext.profile.birthplace.label, 'Tainan, Taiwan');
  assert.deepEqual(
    Object.keys(timeContext).sort(),
    ['conventions', 'flags', 'jd', 'local', 'lunar', 'profile', 'solar', 'solarTerms', 'utc'],
  );
  assert.equal(timeContext.conventions.useTrueSolarTime, true);
  assert.equal(timeContext.conventions.bazi.dayHourClock, 'trueSolar');
  assert.equal(timeContext.conventions.ziwei.clock, 'trueSolar');
  assert.deepEqual(timeContext.conventions.timeline.skippedInSyncAnalyze, ['jyotish', 'humanDesign']);
  // input echo keeps the v3 shape; coordinates follow the resolved birthplace
  assert.deepEqual(Object.keys(report.input), ['year', 'month', 'day', 'hour', 'minute', 'gender', 'name', 'longitude', 'latitude']);
  assert.equal(report.input.longitude, 120.1848);
});

test('出生地解析：birthplace > cityId > 舊經緯度（Asia/Taipei）> 預設台北', SLOW, () => {
  const base: AnalyzeInput = { year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female' };
  const tc = (input: AnalyzeInput) => analyze(input, { asOf: AS_OF }).timeContext;
  assert.equal(tc(base).conventions.birthplaceSource, 'default');
  assert.equal(tc(base).profile.birthplace.label, 'Taipei, Taiwan');

  const legacy = tc({ ...base, longitude: 120.1848, latitude: 22.9922 });
  assert.equal(legacy.conventions.birthplaceSource, 'legacyCoordinates');
  assert.equal(legacy.profile.birthplace.timezone, 'Asia/Taipei');
  assert.equal(legacy.profile.birthplace.lng, 120.1848);
  assert.deepEqual(legacy.conventions.warnings, []);
  // v3-style foreign coordinates are still read as Taiwan civil time — flagged.
  const honolulu = tc({ ...base, longitude: -157.8667, latitude: 21.3 });
  assert.equal(honolulu.profile.birthplace.timezone, 'Asia/Taipei');
  assert.deepEqual(honolulu.conventions.warnings, ['legacy_coordinates_outside_utc+8_meridian']);

  const bp = { label: 'Tokyo, JP', lat: 35.68, lng: 139.69, timezone: 'Asia/Tokyo' };
  const explicit = tc({ ...base, birthplace: bp, cityId: 'tainan', longitude: 1 });
  assert.equal(explicit.conventions.birthplaceSource, 'birthplace');
  assert.deepEqual(explicit.profile.birthplace, bp);
  assert.equal(explicit.local!.utcOffsetMinutes, 540);

  assert.throws(() => analyze({ ...base, cityId: 'atlantis' }, { asOf: AS_OF }), /Unknown cityId/);
  assert.throws(() => analyze({ ...base, ziHourConvention: 'midnight' } as any, { asOf: AS_OF }), /ziHourConvention/);
  assert.throws(() => analyze({ ...base, timeAccuracy: 'roughly' } as any, { asOf: AS_OF }), /timeAccuracy/);
  assert.throws(() => analyze({ ...base, birthplace: { ...bp, timezone: '+09:00' } }, { asOf: AS_OF }), /timezone/);
  assert.throws(() => analyze({ ...base, useTrueSolarTime: 'yes' } as any, { asOf: AS_OF }), /useTrueSolarTime/);

  const approx = tc({ ...base, timeAccuracy: 'approx1h' });
  assert.equal(approx.profile.timeAccuracy, 'approx1h');
  assert.ok(approx.flags.some(f => f.code === 'near_shichen_boundary'));
});

test('timeline：5 年 + 12 月；jyotish／humanDesign 在同步 analyze 一律略過；signals 為 topSignals 去重聯集', SLOW, () => {
  const report = analyze({ year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female', name: 'Mei' }, { asOf: AS_OF });
  const { timeline, signals } = report;
  assert.equal(timeline.asOf, AS_OF);
  assert.deepEqual(timeline.years.map(c => c.window.start), ['2026-01-01', '2027-01-01', '2028-01-01', '2029-01-01', '2030-01-01']);
  assert.equal(timeline.months.length, 12);
  assert.deepEqual(timeline.systems, ['bazi', 'ziwei', 'numerology']);
  assert.deepEqual(timeline.skippedSystems, [
    { system: 'jyotish', reason: 'ephemeris_not_initialised' },
    { system: 'humanDesign', reason: 'ephemeris_not_initialised' },
  ]);

  const ids = signals.map(s => s.id);
  assert.deepEqual(ids, [...new Set(ids)].sort(), 'unique and sorted by id');
  const top = new Set();
  for (const cell of [...timeline.years, ...timeline.months]) {
    for (const d of cell.domains) for (const s of d.topSignals) top.add(s.id);
  }
  assert.deepEqual([...top].sort(), ids);
  assert.ok(signals.length > 0);
  assert.ok(signals.every(s => typeof s.evidence.text === 'string'));
});

test('出生時間未知：timeContext 無時刻、timeline 略過八字/紫微/jyotish/humanDesign', SLOW, () => {
  const report = analyze({ year: 1991, month: 10, day: 5, gender: 'female', timeKnown: false }, { asOf: AS_OF });
  assert.equal(report.timeContext.local, null);
  assert.equal(report.timeContext.profile.time, null);
  assert.equal(report.timeContext.profile.timeAccuracy, 'unknown');
  assert.deepEqual(report.timeline.systems, ['numerology']);
  assert.deepEqual(report.timeline.skippedSystems.map(s => [s.system, s.reason]), [
    ['bazi', 'time_unknown'], ['ziwei', 'time_unknown'], ['jyotish', 'time_unknown'], ['humanDesign', 'time_unknown'],
  ]);
  assert.deepEqual(report.honesty.violations, []);
});

test('決定論、誠實稽核零違規、大小與效能', SLOW, () => {
  const inputs: AnalyzeInput[] = [
    { year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female', name: 'Test Person' },
    { year: 2026, month: 3, day: 5, hour: 12, minute: 0, gender: 'male', cityId: 'new-york' },
    { year: 1990, month: 6, day: 15, hour: 23, minute: 30, gender: 'female', ziHourConvention: 'early' },
    { year: 1975, month: 7, day: 1, hour: 0, minute: 30, gender: 'male', name: '陳大文' }, // Taiwan DST era
  ];
  for (const input of inputs) {
    const t0 = performance.now();
    const a = analyze(input, { asOf: AS_OF });
    const ms = performance.now() - t0;
    const b = analyze(input, { asOf: AS_OF });
    assert.deepEqual(stable(a), stable(b));
    assert.equal(a.schemaVersion, REPORT_SCHEMA_VERSION);
    assert.deepEqual(a.honesty.violations, []);
    for (const e of a.engines) {
      if (e.engineId !== 'numerology') assert.deepEqual(e.errors, [], e.engineId);
    }
    const bytes = JSON.stringify(a).length;
    console.log(`[report v4] ${input.year}-${input.month}-${input.day}: ${(bytes / 1024).toFixed(0)} KB JSON, ${a.signals.length} signals, ${ms.toFixed(0)} ms`);
    assert.ok(bytes < 1.5 * 1024 * 1024, `report too large: ${bytes}`);
    assert.ok(ms < 3000, `analyze() took ${ms} ms`);
  }
});

// ─── v5 (D-034) ─────────────────────────────────────────────────────────────

test('Report v5：consensus = buildConsensus(timeline)，v4 欄位不變', SLOW, () => {
  const report = analyze({ year: 1995, month: 7, day: 16, hour: 22, minute: 0, gender: 'male', cityId: 'tainan' }, { asOf: '2026-09-25' });
  assert.equal(report.schemaVersion, 5);
  assert.deepEqual(report.consensus, buildConsensus(report.timeline));
  assert.deepEqual(report.consensus.systems, ['bazi', 'ziwei', 'numerology']);
  assert.equal(report.consensus.years.length, report.timeline.years.length);
  assert.equal(report.consensus.coverage.months.length, 12);
  for (const cell of report.consensus.coverage.years) {
    for (const d of cell.domains) assert.equal(d.available, 3);
  }
  // Every conflict in the year cells is in the headlines (never dropped, D-023).
  const conflicts = report.timeline.years.flatMap(c => c.domains.filter(d => d.conflict).map(d => `${c.window.start}:${d.domain}`));
  assert.deepEqual(report.consensus.headlines.conflicts.map(c => `${c.window.start}:${c.domain}`), conflicts);
  assert.deepEqual(report.honesty.violations, []);
});

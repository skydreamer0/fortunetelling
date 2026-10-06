import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPORT_FILE_NAMES,
  buildExportBundle,
  createProfileFile,
  redactProfile,
  scrubDeep,
  scrubString,
  sensitiveStringsOf,
  serializeExportBundle,
  type BirthProfile,
} from '../src/index';

const profile: BirthProfile = {
  date: '1990-05-17',
  time: '08:30',
  timeAccuracy: 'exact',
  gender: 'female',
  name: '王小明',
  birthplace: { label: '台南市', lat: 22.9999, lng: 120.2269, timezone: 'Asia/Taipei' },
};
const file = createProfileFile('sky', profile);
const ASOF = '2026-10-03';

describe('redact（單一來源）', () => {
  test('redactProfile 移除姓名與標籤，保留計算所需欄位', () => {
    const r = redactProfile(profile);
    expect('name' in r).toBe(false);
    expect('label' in r.birthplace).toBe(false);
    expect(r.birthplace).toEqual({ lat: 22.9999, lng: 120.2269, timezone: 'Asia/Taipei' });
    expect(redactProfile(profile, { dropCoordinates: true }).birthplace).toEqual({ timezone: 'Asia/Taipei' });
  });
  test('scrubDeep 取代殘留字串且不改動輸入', () => {
    const input = { a: ['王小明的盤', { b: '出生於台南市' }], n: 1 };
    const out = scrubDeep(input, sensitiveStringsOf(profile));
    expect(JSON.stringify(out)).not.toContain('王小明');
    expect(JSON.stringify(out)).not.toContain('台南市');
    expect(input.a[0]).toBe('王小明的盤');
  });
  test('較長字串優先，避免殘留半截', () => {
    expect(scrubString('王小明家', { name: '王小明', place: '王小明家' })).toBe('[place]');
  });
});

describe('buildExportBundle', () => {
  test('同一輸入位元穩定、不含時間戳', async () => {
    const a = serializeExportBundle(await buildExportBundle(file, { preset: 'local-full', asOf: ASOF }));
    const b = serializeExportBundle(await buildExportBundle(file, { preset: 'local-full', asOf: ASOF }));
    expect(a).toEqual(b);
    expect(Object.keys(a)).toEqual([...EXPORT_FILE_NAMES]);
    for (const text of Object.values(a)) expect(text).not.toContain('generatedAt');
  });

  test('local-full 保留姓名與地名', async () => {
    const files = serializeExportBundle(await buildExportBundle(file, { preset: 'local-full', asOf: ASOF }));
    expect(files['profile.json']).toContain('王小明');
    expect(files['profile.json']).toContain('台南市');
  });

  test('share-redacted 全部檔案都不含姓名與地名標籤', async () => {
    const bundle = await buildExportBundle(file, { preset: 'share-redacted', asOf: ASOF });
    expect(bundle.manifest.redacted).toBe(true);
    for (const [name, text] of Object.entries(serializeExportBundle(bundle))) {
      expect(text, name).not.toContain('王小明');
      expect(text, name).not.toContain('台南市');
    }
  });

  test('manifest 版本欄位齊全', async () => {
    const { manifest } = await buildExportBundle(file, { preset: 'local-full', asOf: ASOF });
    expect(manifest.format).toBe('fortune.export');
    expect(manifest.exportSchemaVersion).toBe(1);
    expect(manifest.asOf).toBe(ASOF);
    expect(manifest.redacted).toBe(false);
    expect(manifest.chartFingerprint).toBe(file.chartFingerprint);
    const v = manifest.versions;
    expect(v.coreVersion).toBeTruthy();
    expect(v.profileSchemaVersion).toBe(1);
    expect(Object.keys(v.catalogs).length).toBeGreaterThan(0);
    expect(Object.keys(v.calculators).length).toBe(7);
    expect(manifest.ephemeris.mode).toBe('moshier');
    expect(manifest.systems.participating.length).toBeGreaterThan(0);
    expect(Object.keys(manifest.charts).sort()).toEqual(['bazi', 'humanDesign', 'jyotish', 'mingGua', 'numerology', 'tzolkin', 'ziwei']);
    expect(Object.keys(manifest.files).sort()).toEqual(EXPORT_FILE_NAMES.filter(n => n !== 'manifest.json').sort());
  });

  test('時間未知：需要時間的系統標 available:false', async () => {
    const unknown = createProfileFile('u', { ...profile, time: null, timeAccuracy: 'unknown' });
    const { manifest } = await buildExportBundle(unknown, { preset: 'local-full', asOf: ASOF });
    expect(manifest.charts.bazi!.available).toBe(false);
    expect(manifest.charts.numerology!.available).toBe(true);
  });

  test('拒絕不合法的 asOf／preset', async () => {
    await expect(buildExportBundle(file, { preset: 'local-full', asOf: '2026/10/03' })).rejects.toThrow();
    await expect(buildExportBundle(file, { preset: 'nope' as never, asOf: ASOF })).rejects.toThrow();
  });

  test('timeline 的 topSignalIds 都能在 signals.json 找到', async () => {
    const bundle = await buildExportBundle(file, { preset: 'local-full', asOf: ASOF });
    const ids = new Set((bundle.signals as { signals: { id: string }[] }).signals.map(s => s.id));
    const cells = [...(bundle.timeline as any).years, ...(bundle.timeline as any).months];
    let checked = 0;
    for (const cell of cells) for (const d of cell.domains) for (const id of d.topSignalIds) { expect(ids.has(id)).toBe(true); checked++; }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('golden', () => {
  // Preserve the v0.5.0 fixture. D-040 changes only the manifest core version;
  // every exported file hash and signal count remains pinned to the original.
  const goldenPath = join(import.meta.dir, 'fixtures', 'export.golden.json');
  test('share-redacted 檔案內容指紋固定', async () => {
    const bundle = await buildExportBundle(file, { preset: 'share-redacted', asOf: ASOF });
    const actual = { versions: bundle.manifest.versions, files: bundle.manifest.files, signalCount: (bundle.signals as any).count };
    const text = `${JSON.stringify(actual, null, 2)}\n`;
    const original = readFileSync(goldenPath, 'utf8').replace(/\r\n/g, '\n');
    expect(new Bun.CryptoHasher('sha256').update(original).digest('hex')).toBe('90189fb31fea2937ec78db9688a5cea49714504f054525fe46a39ecc6a860668');
    const recorded = JSON.parse(original);
    expect(recorded.versions.coreVersion).toBe('0.5.0');
    recorded.versions.coreVersion = '0.5.2';
    expect(text).toBe(`${JSON.stringify(recorded, null, 2)}\n`);
  });
});

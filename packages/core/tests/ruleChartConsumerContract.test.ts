import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { expect, test } from 'vitest';
import { fromBaziComponents } from '../src/rules/bazi/chart';
import { fromZiweiComponents, type ZiweiComponentLike } from '../src/rules/ziwei/chart';

type IsAny<T> = 0 extends (1 & T) ? true : false;
type BaziInput = Extract<Parameters<typeof fromBaziComponents>[0], readonly unknown[]>;
const baziPayloadIsAny: IsAny<BaziInput[number]['value']> = false;
const ziweiPayloadIsAny: IsAny<ZiweiComponentLike['value']> = false;
function cannotReadOpaquePayload(bazi: BaziInput[number], ziwei: ZiweiComponentLike) {
  // @ts-expect-error opaque input does not prove a natal producer
  bazi.value.year;
  // @ts-expect-error an open category does not validate palace data
  ziwei.value.majorStars;
}
void cannotReadOpaquePayload;

test('both component boundaries expose unknown rather than unchecked any', () => {
  expect(baziPayloadIsAny).toBe(false);
  expect(ziweiPayloadIsAny).toBe(false);
});

// Pinned from exact accepted master d9133cf, before this type-only change.
// These checks are about emitted JS, not source text or a regenerated golden.
for (const [system, expected] of [
  ['bazi', 'a336f55ddb1e96caf31dfdb30acac53378e8217f84f8ac24835f138bf11bc307'],
  ['ziwei', 'ac46e508896ca97d833bf3b2504856ea0ebafc22075a1fb35a9085df45d23d99'],
] as const) test(`${system} adapter erases to unchanged executable code`, () => {
  const source = readFileSync(new URL(`../src/rules/${system}/chart.ts`, import.meta.url), 'utf8');
  const emit = (value: string) => transformSync(value, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  expect(hash(emit(source))).toBe(expected);
  expect(hash(emit(`${source}\nconsole.log('unreviewed runtime mutation');`))).not.toBe(expected);
});

test('BaZi retains legacy hour fallback, accessor reads, string years and ordering', () => {
  const reads: string[] = [];
  const natal = { year: '甲子', month: '乙丑', day: '丙寅', time: null, hour: '丁卯' };
  const input = [
    { id: 'natal', get value() { reads.push('natal'); return natal; } },
    { id: 'dy', category: 'daYun', value: { index: 1, ganZhi: '戊辰', startYear: '2020', endYear: '2029' } },
    { id: 'year', category: 'liuNian', value: { year: 2026, ganZhi: '丙午' } },
    { id: 'plugin', category: 'custom', value: Symbol('opaque') },
  ];
  expect(fromBaziComponents({ components: input })).toEqual({
    pillars: { year: '甲子', month: '乙丑', day: '丙寅', hour: '丁卯' },
    luckCycles: [{ index: 1, ganZhi: '戊辰', start: '2020-01-01', end: '2029-12-31', componentId: 'dy' }],
    natalComponentId: 'natal', annual: { year: 2026, ganZhi: '丙午', componentId: 'year' },
  });
  expect(reads).toEqual(Array(6).fill('natal'));
  expect(natal.time).toBeNull();
  expect(fromBaziComponents([])).toEqual({ pillars: { year: null, month: null, day: null, hour: null }, luckCycles: [], natalComponentId: 'natal' });
  expect(() => fromBaziComponents([{ id: 'natal', value: { year: 'invalid' } }])).toThrow();
});

function palaces(star: unknown = null): ZiweiComponentLike[] {
  return Array.from({ length: 12 }, (_, index) => ({ id: `palace_${index}`, category: 'palaces', value: {
    index, name: `宮${index}`, earthlyBranch: '子', isBodyPalace: index === 0 ? 'legacy-truthy' : 0,
    majorStars: index === 0 ? [star] : [], minorStars: [],
  } }));
}

test('Ziwei keeps partial caller contracts, star coercion, nonfinite scores and getters', () => {
  let brightnessReads = 0;
  const star = { name: 42, get brightness() { brightnessReads++; return '廟'; }, brightnessScore: NaN, mutagen: '忌' };
  const input = palaces(star).reverse();
  input.push({ id: 'unknown', category: 'arbitrary', value: () => 'opaque' });
  const chart = fromZiweiComponents(input);
  expect(chart.palaces.map(p => p.index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  expect(chart.palaces[0].isBodyPalace).toBe(true);
  expect(chart.palaces[0].stars[0]).toEqual({ name: '42', kind: 'major', brightness: '廟', brightnessScore: NaN, mutagen: '忌' });
  expect(brightnessReads).toBe(2);
  expect(chart.birthLunarYear).toBeNull();
  expect(chart.componentIds).toContain('unknown');
  expect(fromZiweiComponents(palaces()).palaces[0].stars[0]).toEqual({ name: '', kind: 'major', brightness: '', brightnessScore: null, mutagen: null });
  expect(() => fromZiweiComponents([])).toThrow('expected 12 palaces');
  const malformed = palaces();
  malformed[0].value = { index: 0, majorStars: 'not-an-array' };
  expect(() => fromZiweiComponents(malformed)).toThrow();
});

test('Ziwei period conventions and full sequence copies remain unchanged', () => {
  const input = palaces();
  input.push({ id: 'natal_summary', category: 'natal', value: { lunarDate: '一九九一年八月廿八' } });
  input.push({ id: 'daXian_1', category: 'daXian', value: { index: 1, range: [1, 10], palaceIndex: 0, heavenlyStem: '甲', earthlyBranch: '子', mutagen: ['天梁', '紫微', '左輔', '武曲'] } });
  const chart = fromZiweiComponents(input);
  expect(chart.birthLunarYear).toBe(1991);
  expect(chart.decades).toEqual([{ componentId: 'daXian_1', label: '第1大限（虛歲 1–10）', palaceIndex: 0, heavenlyStem: '甲', earthlyBranch: '子', mutagen: { 祿: '天梁', 權: '紫微', 科: '左輔', 忌: '武曲' }, start: '1991-01-01', end: '2000-12-31' }]);
  expect(chart.yearly).toBeNull();
  expect(chart.yearlySequence).toEqual([]);
  expect(chart.monthlySequence).toEqual([]);
});

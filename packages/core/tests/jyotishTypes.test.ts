import { beforeAll, expect, test } from 'bun:test';
import { EPHEMERIS_MOSHIER_WARNING, initEphemeris } from '../src/calculators/astro/index';
import {
  buildJyotishChart, jyotishCalculator, jyotishComponents,
  type JyotishChart, type JyotishConfig,
} from '../src/calculators/jyotish/calculator';
import type {
  JyotishComponent, JyotishCurrentDashaValue, JyotishDashaBalanceValue,
  JyotishHouseValue, JyotishMahadashaValue, JyotishSettingsValue,
} from '../src/calculators/jyotish/componentTypes';
import type { Component } from '../src/calculators/types';
import type { BirthProfile } from '../src/profile/index';
import { createTimeContext } from '../src/time/index';

type Reject<T extends false> = T;
type Accept<T extends true> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type ContainsAny<T> = IsAny<T> extends true ? true : T extends object
  ? true extends { [K in keyof T]-?: ContainsAny<T[K]> }[keyof T] ? true : false
  : false;
type Payload<C extends JyotishComponent['category']> = Extract<JyotishComponent, { category: C }>['value'];
type AtId<I extends JyotishComponent['id']> = Extract<JyotishComponent, { id: I }>;

export type RejectAny = Reject<ContainsAny<JyotishComponent>>;
export type RejectUnknown = Reject<true extends {
  [C in JyotishComponent['category']]: unknown extends Payload<C> ? true : false
}[JyotishComponent['category']] ? true : false>;
export type RejectWrongCategory = Reject<{
  id: 'ayanamsa'; name: string; category: 'lagna'; value: JyotishChart['lagna'];
} extends JyotishComponent ? true : false>;
export type RejectWrongGrahaId = Reject<{
  id: 'graha_pluto'; name: string; category: 'graha'; value: JyotishChart['planets'][number];
} extends JyotishComponent ? true : false>;
export type RejectWrongVargaId = Reject<{
  id: 'varga_D12'; name: string; category: 'divisional'; value: Payload<'divisional'>;
} extends JyotishComponent ? true : false>;
export type RejectWrongHouseId = Reject<{
  id: 'house_first'; name: string; category: 'house'; value: JyotishHouseValue;
} extends JyotishComponent ? true : false>;
export type RejectSwappedCurrent = Reject<{
  id: 'current_dasha'; name: string; category: 'current'; value: AtId<'transits'>['value'];
} extends JyotishComponent ? true : false>;
export type RejectSwappedTransits = Reject<{
  id: 'transits'; name: string; category: 'current'; value: JyotishCurrentDashaValue;
} extends JyotishComponent ? true : false>;
export type RejectMissingDegrees = Reject<Omit<JyotishSettingsValue, 'degrees'> extends JyotishSettingsValue ? true : false>;
export type RejectWrongDegrees = Reject<Omit<JyotishSettingsValue, 'degrees'> & { degrees: string } extends JyotishSettingsValue ? true : false>;
export type RejectMissingOccupants = Reject<Omit<JyotishHouseValue, 'occupants'> extends JyotishHouseValue ? true : false>;
export type RejectWrongOccupants = Reject<Omit<JyotishHouseValue, 'occupants'> & { occupants: number[] } extends JyotishHouseValue ? true : false>;
export type RejectMissingBalance = Reject<Omit<JyotishDashaBalanceValue, 'balanceYears'> extends JyotishDashaBalanceValue ? true : false>;
export type RejectMissingAntar = Reject<Omit<JyotishMahadashaValue, 'antardashas'> extends JyotishMahadashaValue ? true : false>;
export type RejectWrongAntar = Reject<Omit<JyotishMahadashaValue, 'antardashas'> & { antardashas: string[] } extends JyotishMahadashaValue ? true : false>;
export type RejectMissingCurrentIndex = Reject<Omit<JyotishCurrentDashaValue['maha'], 'index'> extends JyotishCurrentDashaValue['maha'] ? true : false>;
export type RejectMissingCurrentEnd = Reject<Omit<JyotishCurrentDashaValue['antar'], 'end'> extends JyotishCurrentDashaValue['antar'] ? true : false>;
export type RejectMissingSadeSati = Reject<Omit<AtId<'transits'>['value'], 'sadeSati'> extends AtId<'transits'>['value'] ? true : false>;
export type RejectUndefinedPayload = Reject<true extends {
  [C in JyotishComponent['category']]: undefined extends Payload<C> ? true : false
}[JyotishComponent['category']] ? true : false>;
export type RejectNullNonLagna = Reject<true extends {
  [C in Exclude<JyotishComponent['category'], 'lagna'>]: null extends Payload<C> ? true : false
}[Exclude<JyotishComponent['category'], 'lagna'>] ? true : false>;
export type AcceptNullableLagna = Accept<null extends Payload<'lagna'> ? true : false>;
export type AcceptNullableDegrees = Accept<null extends JyotishSettingsValue['degrees'] ? true : false>;
export type AcceptNullableLordHouse = Accept<null extends JyotishHouseValue['lordHouse'] ? true : false>;
export type AcceptLegacyBoundary = Accept<JyotishComponent extends Component ? true : false>;
export type AcceptTypedProducer = Accept<ReturnType<typeof jyotishComponents> extends JyotishComponent[] ? true : false>;
export type RejectWidenedProducer = Reject<Component[] extends ReturnType<typeof jyotishComponents> ? true : false>;

// Positive narrowing covers every category and both fixed IDs sharing "current".
export function payloadLabel(component: JyotishComponent): string {
  switch (component.category) {
    case 'settings': { const id: 'ayanamsa' = component.id; return `${id}:${component.value.degrees}`; }
    case 'lagna': { const id: 'lagna' = component.id; return `${id}:${component.value?.sign}`; }
    case 'graha': return `${component.id}:${component.value.graha}`;
    case 'house': return `${component.id}:${component.value.occupants.length}`;
    case 'divisional': return `${component.id}:${component.value.id}`;
    case 'dasha': { const id: 'dasha_balance' = component.id; return `${id}:${component.value.balanceYears}`; }
    case 'mahadasha': return `${component.id}:${component.value.antardashas.length}`;
    case 'current':
      if (component.id === 'current_dasha') return `${component.id}:${component.value.maha.index}`;
      return `${component.id}:${component.value.sadeSati.active}`;
  }
}

const PROFILE: BirthProfile = {
  date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male',
  birthplace: { label: 'Tainan, Taiwan', lat: 22.99, lng: 120.18, timezone: 'Asia/Taipei' },
};
const ASOF = '2026-09-25';

beforeAll(async () => { await initEphemeris(); });

// Frozen producer from master fbe01cb8db36fe368e28511e3a10fa80f64521e2.
// Keep its projection independent from the new contracts and implementation.
function legacyJyotishComponents(chart: JyotishChart): Component[] {
  if (!chart.timeKnown) return [];
  const out: Component[] = [
    {
      id: 'ayanamsa',
      name: `Ayanamsa (${chart.settings.ayanamsa})`,
      category: 'settings',
      value: { ...chart.settings, degrees: chart.ayanamsaDegrees },
    },
    { id: 'lagna', name: 'Lagna 上升', category: 'lagna', value: chart.lagna },
  ];
  for (const p of chart.planets) {
    out.push({ id: `graha_${p.graha}`, name: `${p.name} ${p.nameZh}`, category: 'graha', value: p });
  }
  for (const h of chart.houseLords) {
    const occupants = chart.planets.filter((p) => p.house === h.house).map((p) => p.graha);
    out.push({ id: `house_${h.house}`, name: `第${h.house}宮 Bhava ${h.house}`, category: 'house', value: { ...h, occupants } });
  }
  for (const d of Object.values(chart.divisionalCharts!)) {
    out.push({ id: `varga_${d.id}`, name: `Varga ${d.id}`, category: 'divisional', value: d });
  }
  const v = chart.dasha!;
  out.push({
    id: 'dasha_balance',
    name: 'Vimshottari balance at birth',
    category: 'dasha',
    value: {
      moonNakshatra: v.moonNakshatra,
      lord: v.moonNakshatraLord,
      elapsedFraction: v.elapsedFraction,
      balanceYears: v.balanceYears,
      yearDays: v.yearDays,
    },
  });
  for (const m of v.mahadashas) {
    out.push({
      id: `mahadasha_${m.index}`,
      name: `Mahadasha ${m.lord}`,
      category: 'mahadasha',
      value: {
        lord: m.lord,
        years: m.years,
        start: m.start,
        end: m.end,
        antardashas: m.antardashas.map((a) => ({ lord: a.lord, years: a.years, start: a.start, end: a.end })),
      },
    });
  }
  if (chart.current.dasha) {
    const { maha, antar } = chart.current.dasha;
    out.push({
      id: 'current_dasha',
      name: 'Current dasha',
      category: 'current',
      value: {
        asOf: chart.current.asOf,
        maha: { index: maha.index, lord: maha.lord, start: maha.start, end: maha.end },
        antar: { lord: antar.lord, start: antar.start, end: antar.end },
      },
    });
  }
  if (chart.current.transits) {
    out.push({ id: 'transits', name: 'Gochara (slow grahas)', category: 'current', value: chart.current.transits });
  }
  return out;
}

test('Jyotish producer retains byte-for-byte serialized projections across settings and dates', () => {
  const ctx = createTimeContext(PROFILE);
  for (const ayanamsa of ['lahiri', 'krishnamurti'] as const) {
    for (const node of ['mean', 'true'] as const) {
      for (const dashaYearDays of [360, 365.25]) {
        for (const asOf of ['1900-01-01', ASOF, '2150-01-01']) {
          const config = { ayanamsa, node, dashaYearDays, asOf };
          const chart = buildJyotishChart(ctx, config);
          const components = jyotishComponents(chart);
          expect(JSON.stringify(components)).toBe(JSON.stringify(legacyJyotishComponents(chart)));
          expect(new Set(components.map(c => c.category))).toEqual(new Set([
            'settings', 'lagna', 'graha', 'house', 'divisional', 'dasha', 'mahadasha', 'current',
          ]));
          expect(components.every(c => !Object.hasOwn(c, 'meta'))).toBe(true);
          expect(components.map(payloadLabel)).toHaveLength(components.length);
          expect(components.filter(c => c.category === 'graha')).toHaveLength(9);
          expect(components.filter(c => c.category === 'house')).toHaveLength(12);
          expect(components.filter(c => c.category === 'divisional')).toHaveLength(3);
          expect(components.filter(c => c.category === 'mahadasha')).toHaveLength(9);
          const result = jyotishCalculator.calculate(ctx, config);
          expect(JSON.stringify(result)).toBe(JSON.stringify({
            system: 'jyotish', version: '1.0.0', chart,
            components: legacyJyotishComponents(chart), warnings: [EPHEMERIS_MOSHIER_WARNING],
          }));
        }
      }
    }
  }
});

test('Jyotish optional current components retain omission and fixed ordering', () => {
  const chart = buildJyotishChart(createTimeContext(PROFILE), { asOf: ASOF });
  for (const dasha of [chart.current.dasha, null]) {
    for (const transits of [chart.current.transits, null]) {
      const input = { ...chart, current: { ...chart.current, dasha, transits } };
      const components = jyotishComponents(input);
      expect(JSON.stringify(components)).toBe(JSON.stringify(legacyJyotishComponents(input)));
      expect(components.filter(c => c.category === 'current').map(c => c.id)).toEqual([
        ...(dasha ? ['current_dasha'] : []), ...(transits ? ['transits'] : []),
      ]);
    }
  }
});

test('Jyotish retains admitted null payload fields without normalizing or cloning them', () => {
  const chart = buildJyotishChart(createTimeContext(PROFILE), { asOf: ASOF });
  const input: JyotishChart = {
    ...chart, lagna: null, ayanamsaDegrees: null,
    houseLords: chart.houseLords.map(h => ({ ...h, lordHouse: null })),
  };
  const components = jyotishComponents(input);
  expect(JSON.stringify(components)).toBe(JSON.stringify(legacyJyotishComponents(input)));
  expect(components.find(c => c.id === 'lagna')?.value).toBeNull();
  const settings = components.find(c => c.category === 'settings');
  expect(settings?.value.degrees).toBeNull();
  for (const component of components) {
    if (component.category === 'graha') expect(component.value).toBe(input.planets.find(p => component.id === `graha_${p.graha}`));
    if (component.category === 'house') expect(component.value.lordHouse).toBeNull();
    if (component.category === 'divisional') expect(component.value).toBe(input.divisionalCharts![component.value.id]);
    if (component.id === 'transits') expect(component.value).toBe(input.current.transits);
  }
});

test('Jyotish unknown-time chart, warning and empty components remain unchanged', () => {
  const ctx = createTimeContext({ ...PROFILE, time: null, timeAccuracy: 'unknown' });
  const result = jyotishCalculator.calculate(ctx, { asOf: ASOF });
  expect(result.chart.timeKnown).toBe(false);
  expect(result.chart.settings).toEqual({ ayanamsa: 'lahiri', node: 'mean', dashaYearDays: 365.25, houseSystem: 'whole_sign' });
  expect(result.components).toEqual([]);
  expect(result.components).toEqual(legacyJyotishComponents(result.chart));
  expect(result.warnings).toEqual(['time_unknown']);
  expect(result.chart.lagna).toBeNull();
  expect(result.chart.ayanamsaDegrees).toBeNull();
  expect(result.chart.birthJd).toBeNull();
  expect(result.chart.planets).toEqual([]);
  expect(result.chart.houseLords).toEqual([]);
  expect(result.chart.divisionalCharts).toBeNull();
  expect(result.chart.dasha).toBeNull();
  expect(result.chart.current.dasha).toBeNull();
  expect(result.chart.current.transits).toBeNull();
  expect(Object.hasOwn(result, 'meta')).toBe(false);
});

test('Jyotish defaults and invalid asOf errors remain unchanged', () => {
  const ctx = createTimeContext(PROFILE);
  const defaults: JyotishConfig = { asOf: ASOF, ayanamsa: 'lahiri', node: 'mean', dashaYearDays: 365.25 };
  expect(JSON.stringify(jyotishCalculator.calculate(ctx, { asOf: ASOF }))).toBe(
    JSON.stringify(jyotishCalculator.calculate(ctx, defaults)),
  );
  expect(() => jyotishCalculator.calculate(ctx)).toThrow();
  expect(() => jyotishCalculator.calculate(ctx, { asOf: 'not-a-date' })).toThrow();
});

test('Jyotish producer emits identical JavaScript and its contract has no runtime code', async () => {
  const source = await Bun.file(new URL('../src/calculators/jyotish/calculator.ts', import.meta.url)).text();
  const tests = await Bun.file(import.meta.path).text();
  const start = source.indexOf('export function jyotishComponents(');
  const end = source.indexOf('\nexport const jyotishCalculator', start);
  const oldStart = tests.indexOf('function legacyJyotishComponents(');
  const oldEnd = tests.indexOf('\ntest(', oldStart);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  expect(oldStart).toBeGreaterThanOrEqual(0);
  expect(oldEnd).toBeGreaterThan(oldStart);
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  const baseline = tests.slice(oldStart, oldEnd).replace(
    'function legacyJyotishComponents(', 'export function jyotishComponents(',
  );
  expect(transpiler.transformSync(source.slice(start, end))).toBe(transpiler.transformSync(baseline));
  const types = await Bun.file(new URL('../src/calculators/jyotish/componentTypes.ts', import.meta.url)).text();
  expect(transpiler.transformSync(types).trim()).toBe('');
});

import { expect, test } from 'bun:test';
import type { BaziDayMaster } from '../src/calculators/bazi/calculator';
import { BirthData } from '../src/core/models/BirthData';
import { SystemResult } from '../src/core/models/SystemResult';
import { BaZiEngine, buildBaziNatalComponents, TAIPEI_CONVENTION } from '../src/engines/BaZiEngine';
import type {
  BaziAvailableMetadata,
  BaziComponent,
  BaziDaYunValue,
  BaziElementsValue,
  BaziNatalValue,
  BaziTenGodsContextGroup,
  BaziTenGodsContextValue,
  BaziTenGodsValue,
  BaziUnavailableMetadata,
} from '../src/engines/baziTypes';

// Compiled by the workspace typecheck, including guards against contract widening.
type Reject<T extends false> = T;
type Value<Category extends BaziComponent['category']> = Extract<BaziComponent, { category: Category }>['value'];
type NullishAccepted = {
  [Category in BaziComponent['category']]: null extends Value<Category> ? true
    : undefined extends Value<Category> ? true : false;
}[BaziComponent['category']];
export type RejectNullishValuesInEveryCategory = Reject<NullishAccepted>;
export type RejectWrongId = Reject<{
  id: 'natal'; name: string; category: 'dayMaster'; value: BaziDayMaster;
} extends BaziComponent ? true : false>;
export type RejectWrongCategory = Reject<{
  id: 'day_master'; name: string; category: 'elements'; value: BaziDayMaster;
} extends BaziComponent ? true : false>;
export type RejectWrongPayload = Reject<{
  id: 'day_master'; name: string; category: 'dayMaster'; value: BaziDaYunValue;
} extends BaziComponent ? true : false>;
export type RejectWrongDaYunId = Reject<{
  id: 'daYun_first'; name: string; category: 'daYun'; value: BaziDaYunValue;
} extends BaziComponent ? true : false>;
export type RejectMissingNatalMeta = Reject<{
  id: 'natal'; name: string; category: 'natal'; value: BaziNatalValue;
} extends BaziComponent ? true : false>;
export type RejectMissingLegacyTime = Reject<
  Omit<BaziNatalValue, 'time'> extends BaziNatalValue ? true : false
>;
export type RejectWrongElement = Reject<
  Omit<BaziDayMaster, 'element'> & { element: 'unknown' } extends Value<'dayMaster'> ? true : false
>;
export type RejectMissingFiveElementCount = Reject<
  Omit<BaziElementsValue['counts'], '水'> extends BaziElementsValue['counts'] ? true : false
>;
export type RejectWrongTenGodCount = Reject<
  Record<string, string> extends BaziTenGodsValue['counts'] ? true : false
>;
export type RejectMissingContextShare = Reject<
  Omit<BaziTenGodsContextGroup, 'share'> extends BaziTenGodsContextGroup ? true : false
>;
export type RejectWrongContextPresence = Reject<
  Omit<BaziTenGodsContextGroup, 'presence'> & { presence: 'unknown' } extends BaziTenGodsContextGroup ? true : false
>;
export type RejectWrongContextBreakdown = Reject<
  Omit<BaziTenGodsContextGroup, 'breakdown'> & { breakdown: Record<string, string> } extends BaziTenGodsContextGroup ? true : false
>;
export type RejectMissingObservedTenGods = Reject<
  Omit<BaziTenGodsContextGroup, 'observedTenGods'> extends BaziTenGodsContextGroup ? true : false
>;
export type RejectContextIncludingDayMaster = Reject<
  Omit<BaziTenGodsContextValue, 'includesDayMaster'> & { includesDayMaster: true } extends BaziTenGodsContextValue ? true : false
>;
export type RejectMissingDaYunCurrent = Reject<
  Omit<BaziDaYunValue, 'isCurrent'> extends Value<'daYun'> ? true : false
>;
export type RejectWrongAnnualYear = Reject<
  { year: string; ganZhi: string } extends Value<'liuNian'> ? true : false
>;
export type RejectMissingAsOfConvention = Reject<
  Omit<BaziAvailableMetadata, 'asOfConvention'> extends BaziAvailableMetadata ? true : false
>;
export type RejectMissingUnavailableReason = Reject<
  Omit<BaziUnavailableMetadata, 'unavailableReason'> extends BaziUnavailableMetadata ? true : false
>;
export type RejectNullAvailableMetadata = Reject<null extends BaziAvailableMetadata ? true : false>;
export type RejectUndefinedAvailableMetadata = Reject<undefined extends BaziAvailableMetadata ? true : false>;
export type RejectNullUnavailableMetadata = Reject<null extends BaziUnavailableMetadata ? true : false>;
export type RejectUndefinedUnavailableMetadata = Reject<undefined extends BaziUnavailableMetadata ? true : false>;

export function describePayload(component: BaziComponent): string {
  switch (component.category) {
    case 'natal': {
      const id: 'natal' = component.id;
      return `${id}:${component.value.time}:${component.meta.convention.timezone}`;
    }
    case 'dayMaster': {
      const id: 'day_master' = component.id;
      return `${id}:${component.value.element}`;
    }
    case 'elements': return String(component.value.counts.水);
    case 'tenGods': return String(component.value.counts.比肩);
    case 'tenGodsContext': return component.value.groups.map(group => group.presence).join(',');
    case 'daYun': {
      const id: `daYun_${number}` = component.id;
      return `${id}:${component.value.isCurrent}`;
    }
    case 'liuNian': return String(component.value.year);
    default: {
      const unreachable: never = component;
      return unreachable;
    }
  }
}

const pillars = { year: '乙亥', month: '癸未', day: '戊申', time: '癸亥' };
const categories = ['natal', 'dayMaster', 'elements', 'tenGods', 'tenGodsContext', 'daYun', 'liuNian'] as const;

test('all seven BaZi producer categories retain the pre-refactor serialized vector', () => {
  const result = new BaZiEngine({ asOf: '2026-07-11' }).run(new BirthData({
    year: 1995, month: 7, day: 16, hour: 22, minute: 0, gender: 'male',
  }));
  expect(result.errors).toEqual([]);
  expect([...new Set(result.components.map(component => component.category))]).toEqual([...categories]);
  expect(result.components).toHaveLength(16);
  expect(result.components.filter(component => Object.hasOwn(component, 'meta')).map(component => component.id)).toEqual(['natal']);
  // Captured on master 194c6b01 before edits; excludes nondeterministic timing only.
  expect(new Bun.CryptoHasher('sha256').update(JSON.stringify({
    components: result.components, meta: result.meta,
  })).digest('hex')).toBe('5d7341deb16c019cce3c12207fc875c4dcfdf72a838d7ddb264858e855b7fa6b');
  expect(result.components[0]).toEqual({
    id: 'natal', name: '四柱', category: 'natal',
    value: { ...pillars, convention: TAIPEI_CONVENTION },
    meta: { convention: TAIPEI_CONVENTION },
  } satisfies BaziComponent);
  expect(result.components[1]).toEqual({
    id: 'day_master', name: '日主', category: 'dayMaster',
    value: { stem: '戊', element: '土', yinYang: '陽' },
  } satisfies BaziComponent);
  expect(result.components[15]).toEqual({
    id: 'liuNian', name: '流年', category: 'liuNian', value: { year: 2026, ganZhi: '丙午' },
  } satisfies BaziComponent);
});

test('legacy natal rebuilding preserves custom convention metadata and component omission', () => {
  const convention = { ...TAIPEI_CONVENTION, timezone: 'Europe/Paris', trueSolarTime: true };
  const components = buildBaziNatalComponents(pillars, { convention, elementsLimitation: 'custom limitation' });
  expect(components[0]).toEqual({
    id: 'natal', name: '四柱', category: 'natal', value: { ...pillars, convention }, meta: { convention },
  } satisfies BaziComponent);
  expect(components[0].meta.convention).toBe(convention);
  expect(components[0].value.convention).toBe(convention);
  expect(components[2].value.limitation).toBe('custom limitation');
  expect(components.slice(1).every(component => !Object.hasOwn(component, 'meta'))).toBe(true);
  expect(buildBaziNatalComponents(pillars, { convention: undefined, elementsLimitation: undefined }))
    .toEqual(buildBaziNatalComponents(pillars));
});

test('unknown birth time keeps only the existing unavailable metadata', () => {
  const result = new BaZiEngine().run(new BirthData({
    year: 1995, month: 7, day: 16, timeKnown: false,
  }));
  expect(result.errors).toEqual([]);
  expect(result.components).toEqual([]);
  expect(result.meta).toEqual({
    unavailableReason: 'unknown-time',
    unavailableMessage: '出生時辰不確定，因此八字四柱、十神與大運未計算。',
  } satisfies BaziUnavailableMetadata);
  expect(Object.hasOwn(result.meta, 'asOfConvention')).toBe(false);
});

test('legacy BaZi categories preserve nullish normalization and metadata omission', () => {
  for (const category of categories) {
    for (const value of [undefined, null]) {
      for (const meta of [undefined, null]) {
        const component = SystemResult.component({ category, value, meta });
        expect(JSON.stringify(component)).toBe(JSON.stringify({ id: category, name: category, category, value: null }));
        expect(Object.hasOwn(component, 'meta')).toBe(false);
      }
    }
    expect(SystemResult.component({ category, meta: {} })).toEqual({
      id: category, name: category, category, value: null, meta: {},
    });
  }
});

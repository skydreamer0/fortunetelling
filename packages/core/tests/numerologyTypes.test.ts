import { expect, test } from 'bun:test';
import { BirthData } from '../src/core/models/BirthData';
import { SystemResult } from '../src/core/models/SystemResult';
import { NumerologyEngine } from '../src/engines/NumerologyEngine';
import type {
  NumerologyComponent,
  NumerologyDigitFrequencyValue,
  NumerologyMetadata,
  NumerologyNumberValue,
  NumerologyPersonalYearsValue,
  NumerologyPinnacleValue,
} from '../src/engines/numerologyTypes';

// Compiled by the workspace typecheck; detect widened or disconnected contracts.
type Reject<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type ContainsAny<T> = IsAny<T> extends true ? true : T extends object
  ? true extends { [K in keyof T]-?: ContainsAny<T[K]> }[keyof T] ? true : false
  : false;
export type RejectAnyPayload = Reject<true extends {
  [C in NumerologyComponent['category']]: ContainsAny<Extract<NumerologyComponent, { category: C }>['value']>
}[NumerologyComponent['category']] ? true : false>;
export type RejectAnyMetadata = Reject<ContainsAny<NumerologyMetadata>>;
export type RejectWrongCategory = Reject<{
  id: 'life_path'; name: string; category: 'expression'; value: NumerologyNumberValue;
} extends NumerologyComponent ? true : false>;
export type RejectWrongId = Reject<{
  id: 'personal_year'; name: string; category: 'personalMonth'; value: { number: number; year: number; month: number };
} extends NumerologyComponent ? true : false>;
export type RejectNullPayloads = Reject<true extends {
  [C in NumerologyComponent['category']]: null extends Extract<NumerologyComponent, { category: C }>['value'] ? true : false
}[NumerologyComponent['category']] ? true : false>;
export type RejectUndefinedPayloads = Reject<true extends {
  [C in NumerologyComponent['category']]: undefined extends Extract<NumerologyComponent, { category: C }>['value'] ? true : false
}[NumerologyComponent['category']] ? true : false>;
export type RejectWrongNumber = Reject<{
  number: string; isMaster: boolean;
} extends NumerologyNumberValue ? true : false>;
export type RejectMissingMaster = Reject<{
  number: number;
} extends NumerologyNumberValue ? true : false>;
export type RejectMissingDigit = Reject<
  Omit<NumerologyDigitFrequencyValue, '9'> extends NumerologyDigitFrequencyValue ? true : false
>;
export type RejectMissingEndAge = Reject<
  Omit<NumerologyPinnacleValue, 'endAge'> extends NumerologyPinnacleValue ? true : false
>;
export type RejectUndefinedEndAge = Reject<
  Omit<NumerologyPinnacleValue, 'endAge'> & { endAge: undefined } extends NumerologyPinnacleValue ? true : false
>;
export type RejectMissingSequenceCount = Reject<
  Omit<NumerologyPersonalYearsValue, 'count'> extends NumerologyPersonalYearsValue ? true : false
>;
export type RejectWrongSequence = Reject<{
  fromYear: number; count: number; years: Record<number, string>;
} extends NumerologyPersonalYearsValue ? true : false>;
export type RejectMissingMetadataName = Reject<{} extends NumerologyMetadata ? true : false>;
export type RejectNullMetadataName = Reject<{ name: null } extends NumerologyMetadata ? true : false>;
export type RejectUndefinedMetadataName = Reject<{ name: undefined } extends NumerologyMetadata ? true : false>;

// Exhaustive narrowing requires the category's exact id and payload together.
export function payloadLabel(component: NumerologyComponent): string {
  switch (component.category) {
    case 'lifePath': { const id: 'life_path' = component.id; return `${id}:${component.value.number}`; }
    case 'expression': { const id: 'expression' = component.id; return `${id}:${component.value.isMaster}`; }
    case 'soulUrge': { const id: 'soul_urge' = component.id; return `${id}:${component.value.number}`; }
    case 'personality': { const id: 'personality' = component.id; return `${id}:${component.value.number}`; }
    case 'digitFrequency': { const id: 'digit_frequency' = component.id; return `${id}:${component.value['9']}`; }
    case 'personalYear': { const id: 'personal_year' = component.id; return `${id}:${component.value.year}`; }
    case 'personalMonth': { const id: 'personal_month' = component.id; return `${id}:${component.value.month}`; }
    case 'birthdayNumber': { const id: 'birthday_number' = component.id; return `${id}:${component.value.number}`; }
    case 'attitude': { const id: 'attitude' = component.id; return `${id}:${component.value.number}`; }
    case 'pinnacles': { const id: `pinnacle_${number}` = component.id; return `${id}:${component.value.isMaster}`; }
    case 'challenges': { const id: `challenge_${number}` = component.id; return `${id}:${component.value.endAge}`; }
    case 'personalYears': { const id: 'personal_years' = component.id; return `${id}:${component.value.years[component.value.fromYear]}`; }
  }
}

const sampleComponents: NumerologyComponent[] = [
  { id: 'life_path', name: '生命靈數', category: 'lifePath', value: { number: 2, isMaster: false } },
  { id: 'expression', name: '表達數', category: 'expression', value: { number: 7, isMaster: false } },
  { id: 'soul_urge', name: '靈魂數', category: 'soulUrge', value: { number: 7, isMaster: false } },
  { id: 'personality', name: '人格數', category: 'personality', value: { number: 9, isMaster: false } },
  { id: 'digit_frequency', name: '生命靈數九宮格頻次', category: 'digitFrequency', value: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 1, 6: 1, 7: 1, 8: 0, 9: 2 } },
  { id: 'personal_year', name: '個人流年數', category: 'personalYear', value: { number: 6, year: 2026 } },
  { id: 'personal_month', name: '個人流月數', category: 'personalMonth', value: { number: 4, year: 2026, month: 7 } },
  { id: 'birthday_number', name: '生日數', category: 'birthdayNumber', value: { number: 7, isMaster: false } },
  { id: 'attitude', name: '態度數', category: 'attitude', value: { number: 5, isMaster: false } },
  { id: 'pinnacle_1', name: '第1巔峰數', category: 'pinnacles', value: { index: 1, number: 5, startAge: 0, endAge: 34, isMaster: false } },
  { id: 'pinnacle_2', name: '第2巔峰數', category: 'pinnacles', value: { index: 2, number: 4, startAge: 34, endAge: 43, isMaster: false } },
  { id: 'pinnacle_3', name: '第3巔峰數', category: 'pinnacles', value: { index: 3, number: 9, startAge: 43, endAge: 52, isMaster: false } },
  { id: 'pinnacle_4', name: '第4巔峰數', category: 'pinnacles', value: { index: 4, number: 4, startAge: 52, endAge: null, isMaster: false } },
  { id: 'challenge_1', name: '第1挑戰數', category: 'challenges', value: { index: 1, number: 0, startAge: 0, endAge: 34 } },
  { id: 'challenge_2', name: '第2挑戰數', category: 'challenges', value: { index: 2, number: 1, startAge: 34, endAge: 43 } },
  { id: 'challenge_3', name: '第3挑戰數', category: 'challenges', value: { index: 3, number: 1, startAge: 43, endAge: 52 } },
  { id: 'challenge_4', name: '第4挑戰數', category: 'challenges', value: { index: 4, number: 1, startAge: 52, endAge: null } },
  { id: 'personal_years', name: '個人流年數序列', category: 'personalYears', value: { fromYear: 2026, count: 9, years: { 2026: 6, 2027: 7, 2028: 8, 2029: 9, 2030: 1, 2031: 2, 2032: 3, 2033: 22, 2034: 5 } } },
] satisfies NumerologyComponent[];

test('all twelve Numerology categories retain their serialized vector and metadata omission', () => {
  const result = new NumerologyEngine({ asOf: '2026-07-11' }).run(new BirthData({
    year: 1995, month: 7, day: 16, name: 'Test Person',
  }));
  expect(result.errors).toEqual([]);
  expect(result.components).toEqual(sampleComponents);
  expect(result.meta).toEqual({ name: 'Test Person' } satisfies NumerologyMetadata);
  expect(result.components.every(component => !Object.hasOwn(component, 'meta'))).toBe(true);
  expect(new Set(sampleComponents.map(component => component.category)).size).toBe(12);
  expect(sampleComponents.map(payloadLabel)).toEqual([
    'life_path:2', 'expression:false', 'soul_urge:7', 'personality:9', 'digit_frequency:2',
    'personal_year:2026', 'personal_month:7', 'birthday_number:7', 'attitude:5',
    'pinnacle_1:false', 'pinnacle_2:false', 'pinnacle_3:false', 'pinnacle_4:false',
    'challenge_1:34', 'challenge_2:43', 'challenge_3:52', 'challenge_4:null', 'personal_years:6',
  ]);
});

test('Numerology retains zero name numbers, absent-name warning, and nullable final period ages', () => {
  for (const name of ['', '中文', 'AEIOU', 'BCDF', 'Y']) {
    const result = new NumerologyEngine({ asOf: '2026-07-11' }).run(new BirthData({
      year: 1991, month: 11, day: 9, name,
    }));
    const hasLatin = /[A-Z]/.test(name);
    expect(result.components).toHaveLength(hasLatin ? 18 : 15);
    expect(result.errors).toEqual(hasLatin ? [] : ['姓名無拉丁字母，略過表達數/靈魂數/人格數計算']);
    expect(result.meta).toEqual({ name });
    expect(result.byCategory('lifePath')[0].value).toEqual({ number: 22, isMaster: true });
    expect(result.byCategory('pinnacles').map(component => component.value.isMaster)).toEqual([true, true, true, false]);
    expect(result.byCategory('pinnacles')[3].value.endAge).toBeNull();
    expect(result.byCategory('challenges')[3].value.endAge).toBeNull();
    if (name === 'AEIOU') expect(result.byCategory('personality')[0].value).toEqual({ number: 0, isMaster: false });
    if (name === 'BCDF' || name === 'Y') expect(result.byCategory('soulUrge')[0].value).toEqual({ number: 0, isMaster: false });
  }
});

test('legacy Numerology categories preserve nullish normalization and metadata omission', () => {
  for (const category of new Set(sampleComponents.map(component => component.category))) {
    for (const value of [undefined, null, 0, false, '']) {
      for (const meta of [undefined, null]) {
        const component = SystemResult.component({ category, value, meta });
        expect(JSON.stringify(component)).toBe(JSON.stringify({ id: category, name: category, category, value: value ?? null }));
        expect(Object.hasOwn(component, 'meta')).toBe(false);
      }
    }
    expect(SystemResult.component({ category, meta: {} })).toEqual({
      id: category, name: category, category, value: null, meta: {},
    });
  }
});

test('the private natal projection retains only the existing natal payload subset', async () => {
  const { numerologyNatal } = await import('../src/calculators/numerology/natalAccess');
  const engine = new NumerologyEngine({ asOf: 'invalid-as-of-is-not-read-by-natal' });
  const natal = numerologyNatal(engine, new BirthData({ year: 1995, month: 7, day: 16, name: 'Test Person' }));
  const periodCategories = new Set(['personalYear', 'personalMonth', 'personalYears']);
  expect(natal.components).toEqual(sampleComponents.filter(component => !periodCategories.has(component.category)));
  expect(natal.meta).toEqual({});
  expect(natal.errors).toEqual([]);
  expect(natal.components.every(component => !Object.hasOwn(component, 'meta'))).toBe(true);
});

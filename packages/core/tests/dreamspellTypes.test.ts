import { expect, test } from 'bun:test';
import { BirthData } from '../src/core/models/BirthData';
import { SystemResult } from '../src/core/models/SystemResult';
import { DreamspellEngine } from '../src/engines/DreamspellEngine';
import type {
  DreamspellComponent,
  DreamspellKinValue,
  DreamspellMetadata,
  DreamspellOracleValue,
} from '../src/engines/dreamspellTypes';

// Compiled by the workspace typecheck; a widened/disconnected contract fails it.
type Reject<T extends false> = T;
export type RejectWrongCategory = Reject<{
  id: 'kin'; name: string; category: 'tone'; value: DreamspellKinValue;
} extends DreamspellComponent ? true : false>;
export type RejectWrongId = Reject<{
  id: 'tone'; name: string; category: 'kin'; value: DreamspellKinValue;
} extends DreamspellComponent ? true : false>;
export type RejectWrongPayload = Reject<{
  id: 'tone'; name: string; category: 'tone'; value: DreamspellKinValue;
} extends DreamspellComponent ? true : false>;
export type RejectNullValue = Reject<{
  id: 'kin'; name: string; category: 'kin'; value: null;
} extends DreamspellComponent ? true : false>;
export type RejectUndefinedValue = Reject<{
  id: 'kin'; name: string; category: 'kin'; value: undefined;
} extends DreamspellComponent ? true : false>;
export type RejectMissingSignature = Reject<
  Omit<DreamspellKinValue, 'signature'> extends DreamspellKinValue ? true : false
>;
export type RejectWrongKin = Reject<
  Omit<DreamspellKinValue, 'kin'> & { kin: string } extends DreamspellKinValue ? true : false
>;
export type RejectMissingOracleRole = Reject<
  Omit<DreamspellOracleValue, 'occult'> extends DreamspellOracleValue ? true : false
>;
export type RejectMissingOracleName = Reject<
  Omit<DreamspellOracleValue, 'guide'> & {
    guide: Omit<DreamspellOracleValue['guide'], 'name'>;
  } extends DreamspellOracleValue ? true : false
>;
export type RejectMissingEpoch = Reject<
  Omit<DreamspellMetadata, 'epoch'> extends DreamspellMetadata ? true : false
>;
export type RejectNullMetadata = Reject<null extends DreamspellMetadata ? true : false>;
export type RejectUndefinedMetadata = Reject<undefined extends DreamspellMetadata ? true : false>;

export function payloadKeys(component: DreamspellComponent): string[] {
  switch (component.category) {
    case 'kin': {
      const id: 'kin' = component.id;
      return [id, component.value.signature];
    }
    case 'tone': {
      const id: 'tone' = component.id;
      return [id, component.value.name];
    }
    case 'seal': {
      const id: 'seal' = component.id;
      return [id, component.value.color];
    }
    case 'wavespell': {
      const id: 'wavespell' = component.id;
      return [id, component.value.name];
    }
    case 'castle': {
      const id: 'castle' = component.id;
      return [id, component.value.nameZh];
    }
    case 'oracle': {
      const id: 'oracle' = component.id;
      return [id, component.value.guide.name];
    }
  }
}

const epochComponents = [
  { id: 'kin', name: 'Kin 印記', category: 'kin', value: { kin: 34, signature: '銀河星系巫師', color: '白' } },
  { id: 'tone', name: '銀河音階', category: 'tone', value: { number: 8, name: '銀河星系' } },
  { id: 'seal', name: '圖騰', category: 'seal', value: { number: 14, name: '白巫師', color: '白' } },
  { id: 'wavespell', name: '波符', category: 'wavespell', value: { number: 3, startKin: 27, seal: 7, name: '藍手波符' } },
  {
    id: 'castle', name: '城堡', category: 'castle',
    value: {
      number: 1, name: 'Red Eastern Castle of Turning', nameZh: '紅色東方轉化城堡',
      color: 'red', colorZh: '紅', startKin: 1, endKin: 52,
    },
  },
  {
    id: 'oracle', name: '第五力神諭', category: 'oracle',
    value: {
      destiny: { kin: 34, seal: 14, tone: 8, name: '白銀河星系巫師' },
      guide: { kin: 138, seal: 18, tone: 8, name: '白銀河星系鏡' },
      analog: { kin: 125, seal: 5, tone: 8, name: '紅銀河星系蛇' },
      antipode: { kin: 164, seal: 4, tone: 8, name: '黃銀河星系種子' },
      occult: { kin: 227, seal: 7, tone: 6, name: '藍韻律手' },
    },
  },
] satisfies DreamspellComponent[];

test('all six Dreamspell producer payloads retain the epoch vector and omit component metadata', () => {
  const result = new DreamspellEngine().run(new BirthData({ year: 1987, month: 7, day: 26 }));
  expect(result.errors).toEqual([]);
  expect(result.components).toEqual(epochComponents);
  expect(result.components.every(component => !Object.hasOwn(component, 'meta'))).toBe(true);
  expect(result.meta).toEqual({
    kin: 34, fullSignature: '白銀河星系巫師', epoch: '1987-7-26 = Kin 34',
  } satisfies DreamspellMetadata);
  expect(epochComponents.map(payloadKeys)).toEqual([
    ['kin', '銀河星系巫師'], ['tone', '銀河星系'], ['seal', '白'],
    ['wavespell', '藍手波符'], ['castle', '紅色東方轉化城堡'], ['oracle', '白銀河星系鏡'],
  ]);
});

test('legacy Dreamspell categories preserve nullish normalization and metadata omission', () => {
  for (const { category } of epochComponents) {
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

/**
 * 歷史時區不確定（historical_zone_uncertain）在各計算器 warnings 的傳遞。
 *
 * 受影響（用到出生時刻）：八字、紫微、吠陀占星、人類圖 → 必須帶警告。
 * 不受影響（只用出生日期）：生命靈數、馬雅 Kin、八宅命卦 → 日期取自使用者輸入的當地日曆日，
 * 時區偏移不會改變它，所以不帶警告。現代案例（1995 台南）的 warnings 不得出現新代碼。
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { initEphemeris } from '../src/calculators/astro/index';
import { baziCalculator } from '../src/calculators/bazi/calculator';
import { HISTORICAL_ZONE_WARNING_TEXT } from '../src/calculators/index';
import { humanDesignCalculator } from '../src/calculators/humanDesign/calculator';
import { jyotishCalculator } from '../src/calculators/jyotish/calculator';
import { mingGuaCalculator } from '../src/calculators/mingGua/calculator';
import { numerologyCalculator } from '../src/calculators/numerology/calculator';
import { tzolkinCalculator } from '../src/calculators/tzolkin/calculator';
import { ziweiCalculator } from '../src/calculators/ziwei/calculator';
import type { BirthProfile } from '../src/profile/index';
import { createTimeContext, type TimeContext } from '../src/time/index';

const CODE = 'historical_zone_uncertain';
const ASOF = '2026-07-11';

type Place = BirthProfile['birthplace'];
const REYKJAVIK: Place = { label: 'Reykjavík', lat: 64.15, lng: -21.85, timezone: 'Atlantic/Reykjavik' };
const ULM: Place = { label: 'Ulm', lat: 48.3984, lng: 9.9916, timezone: 'Europe/Berlin' };
const TAINAN: Place = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };

const ctxOf = (date: string, time: string | null, birthplace: Place): TimeContext =>
  createTimeContext({ date, time, timeAccuracy: time === null ? 'unknown' : 'exact', gender: 'female', birthplace });

const BJORK = ctxOf('1965-11-21', '08:10', REYKJAVIK);
const EINSTEIN = ctxOf('1879-03-14', '11:30', ULM);
const MODERN = ctxOf('1995-07-16', '22:00', TAINAN);
const BJORK_UNKNOWN = ctxOf('1965-11-21', null, REYKJAVIK);

beforeAll(async () => {
  await initEphemeris();
});

const timed = [
  ['bazi', (c: TimeContext) => baziCalculator.calculate(c, { asOf: ASOF }).warnings],
  ['ziwei', (c: TimeContext) => ziweiCalculator.calculate(c, { asOf: ASOF }).warnings],
  ['jyotish', (c: TimeContext) => jyotishCalculator.calculate(c, { asOf: ASOF }).warnings],
  ['humanDesign', (c: TimeContext) => humanDesignCalculator.calculate(c).warnings],
] as const;

const dateOnly = [
  ['numerology', (c: TimeContext) => numerologyCalculator.calculate(c, { asOf: ASOF }).warnings],
  ['tzolkin', (c: TimeContext) => tzolkinCalculator.calculate(c).warnings],
  ['mingGua', (c: TimeContext) => mingGuaCalculator.calculate(c).warnings],
] as const;

describe('前置：案例確實帶旗標', () => {
  test('Björk 1965、Ulm 1879 有旗標；1995 台南沒有', () => {
    expect(BJORK.flags.some((f) => f.code === CODE)).toBe(true);
    expect(EINSTEIN.flags.some((f) => f.code === CODE)).toBe(true);
    expect(MODERN.flags.some((f) => f.code === CODE)).toBe(false);
  });
});

describe('用到出生時刻的系統：歷史案例帶警告', () => {
  for (const [name, run] of timed) {
    test(`${name}：Björk 1965 與 Ulm 1879`, () => {
      expect(run(BJORK)).toContain(CODE);
      expect(run(EINSTEIN)).toContain(CODE);
    });
    test(`${name}：1995 台南沒有新警告`, () => {
      expect(run(MODERN)).not.toContain(CODE);
    });
    test(`${name}：時間未知時不警告（沒有出生時刻可受影響）`, () => {
      expect(run(BJORK_UNKNOWN)).not.toContain(CODE);
    });
  }
});

describe('只用日期的系統：不帶警告', () => {
  for (const [name, run] of dateOnly) {
    test(`${name}：即使歷史時區不確定，日期不變、不警告`, () => {
      expect(run(BJORK)).not.toContain(CODE);
      expect(run(EINSTEIN)).not.toContain(CODE);
      expect(run(MODERN)).not.toContain(CODE);
    });
  }
});

describe('警告文字', () => {
  test('台灣繁體中文，說明誤差與保守看待', () => {
    expect(HISTORICAL_ZONE_WARNING_TEXT).toContain('歷史時區不確定');
    expect(HISTORICAL_ZONE_WARNING_TEXT).toContain('±數十分鐘到一小時');
    expect(HISTORICAL_ZONE_WARNING_TEXT).toContain('保守看待');
  });
});

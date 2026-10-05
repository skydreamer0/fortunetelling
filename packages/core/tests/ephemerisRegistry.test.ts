import { describe, expect, test } from 'bun:test';
import { CALCULATORS } from '../src/calculators/index';
import { EPHEMERIS_CALCULATORS, runEphemerisCalculators } from '../src/calculators/ephemerisRegistry';
import { EXPERIMENTAL_SYSTEMS } from '../src/portable/versions';
import { EXPERIMENTAL_SYSTEM_IDS } from '../src/questions/engine';
import type { BirthProfile } from '../src/profile/index';
import { createTimeContext } from '../src/time/index';

const PROFILE: BirthProfile = {
  date: '1995-07-16',
  time: '22:00',
  timeAccuracy: 'exact',
  gender: 'male',
  birthplace: { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' },
};

describe('M5-03 ephemeris registry（sync／async 邊界與驗證狀態）', () => {
  test('同步 CALCULATORS 不含需要星曆的系統；ephemeris registry 只含它們', () => {
    const sync = CALCULATORS.map(c => c.id);
    const async_ = EPHEMERIS_CALCULATORS.map(e => e.calculator.id);
    expect(async_).toEqual(['humanDesign', 'jyotish']);
    for (const system of async_) expect(sync).not.toContain(system);
  });

  test('驗證狀態：人類圖 verified、吠陀占星 experimental；與兩處 experimental 清單一致', () => {
    const experimental = EPHEMERIS_CALCULATORS.filter(e => !e.verified).map(e => e.calculator.id);
    expect(experimental).toEqual(['jyotish']);
    expect([...EXPERIMENTAL_SYSTEMS]).toEqual(experimental);
    expect([...EXPERIMENTAL_SYSTEM_IDS]).toEqual(experimental);
  });

  test('runEphemerisCalculators 自行初始化星曆，依 registry 順序回傳', async () => {
    const results = await runEphemerisCalculators(createTimeContext(PROFILE), { asOf: '2026-09-30' });
    expect(results.map(r => r.system)).toEqual(['humanDesign', 'jyotish']);
    for (const result of results) expect(result.warnings).not.toContain('ephemeris:not_initialised');
  }, 30000);
});

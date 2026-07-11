/**
 * D4 契約測試：EvolutionCalculator（區塊 H③ 時期演化）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BirthData,
  ZiweiEngine,
  BaZiEngine,
  HonestyGuard,
  EvolutionCalculator,
  ScoringRules,
} from '../src/index.js';

const BIRTH = new BirthData({ year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Test Person' });
const AS_OF = '2026-07-11';

/** 跑 bazi + ziwei 並計算演化（顯式 asOf，D-014）。 */
function calculateFull() {
  const bazi = new BaZiEngine({ asOf: AS_OF }).run(BIRTH);
  const ziwei = new ZiweiEngine({ asOf: AS_OF }).run(BIRTH);
  return { bazi, ziwei, evolution: EvolutionCalculator.calculate([bazi, ziwei], { asOf: AS_OF }) };
}

test('periods 數量：bazi = 大運步數（10）、ziwei = 12 大限', () => {
  const { bazi, evolution } = calculateFull();
  const daYunCount = bazi.components.filter(c => c.category === 'daYun').length;

  assert.equal(evolution.periods.filter(p => p.system === 'bazi').length, daYunCount);
  assert.equal(daYunCount, 10);
  assert.equal(evolution.periods.filter(p => p.system === 'ziwei').length, 12);
});

test('Period 契約：形狀五欄、range 年度遞增、summary 恰兩行且過 L1 lint', () => {
  const { evolution } = calculateFull();

  for (const period of evolution.periods) {
    assert.deepEqual(Object.keys(period).sort(), ['isCurrent', 'label', 'radar', 'range', 'summary', 'system'].sort());
    assert.ok(['bazi', 'ziwei'].includes(period.system));
    assert.ok(period.range[1] > period.range[0], `${period.label} range 不遞增`);

    assert.equal(period.summary.length, 2, `${period.label} summary 不是恰好兩行`);
    for (const line of period.summary) {
      const { ok, problems } = HonestyGuard.lint(line, 'L1');
      assert.ok(ok, `L1 lint 違規：${problems.join('；')}（${line}）`);
    }
  }

  // 各系統內 range 依序遞增不重疊
  for (const system of ['bazi', 'ziwei']) {
    const ranges = evolution.periods.filter(p => p.system === system).map(p => p.range);
    for (let i = 1; i < ranges.length; i += 1) {
      assert.ok(ranges[i][0] > ranges[i - 1][0], `${system} 第 ${i} 步起年未遞增`);
      assert.ok(ranges[i][0] > ranges[i - 1][1] - 1, `${system} 第 ${i} 步與前一步重疊`);
    }
  }
});

test('每個 Period.radar 軸的 ruleId 可被 ScoringRules 解析、inputs 可覆核重算', () => {
  const { evolution } = calculateFull();
  const scoring = new ScoringRules();

  for (const period of evolution.periods) {
    for (const axis of period.radar.axes) {
      assert.notEqual(scoring.getRule(axis.ruleId), null, `${period.label}/${axis.label} ruleId 無法解析`);
      assert.ok(axis.assets.length > 0 && axis.liabilities.length > 0);

      if (period.system === 'bazi') {
        const { natalCount, daYunOverlay, natalTotal } = axis.inputs;
        const expected = Math.round(((natalCount + daYunOverlay) / (natalTotal + 2)) * 100 * 100) / 100;
        assert.equal(axis.value, expected, `${period.label}/${axis.label} 軸值與公式重算不符`);
      } else {
        const { mainStarBrightness, auxiliaryStarCount, fourTransformBonus } = axis.inputs;
        const expected = Math.round(
          (mainStarBrightness * 0.6 + Math.min(auxiliaryStarCount * 10, 100) * 0.2 + fourTransformBonus * 0.2) * 100,
        ) / 100;
        assert.equal(axis.value, expected, `${period.label}/${axis.label} 軸值與公式重算不符`);
        assert.ok([0, 100].includes(fourTransformBonus));
      }
    }
    // bazi 五行雷達佔比總和 ≈ 100
    if (period.system === 'bazi') {
      const sum = period.radar.axes.reduce((acc, axis) => acc + axis.value, 0);
      assert.ok(Math.abs(sum - 100) < 0.1, `${period.label} 佔比總和 ${sum} ≠ 100`);
    }
  }
});

test('單調性 sanity：任一步大運疊加後，該干支對應五行的軸值 ≥ 本命同軸值', () => {
  const { bazi, evolution } = calculateFull();
  const natal = bazi.components.find(c => c.category === 'elements').value;
  const stemBranchElements = {
    甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
    寅: '木', 卯: '木', 巳: '火', 午: '火', 辰: '土', 戌: '土', 丑: '土', 未: '土', 申: '金', 酉: '金', 亥: '水', 子: '水',
  };
  const daYunByIndex = new Map(
    bazi.components.filter(c => c.category === 'daYun').map(c => [c.value.index, c.value]),
  );

  for (const period of evolution.periods.filter(p => p.system === 'bazi')) {
    const index = Number(period.radar.id.replace('bazi_element_balance_dayun_', ''));
    const { ganZhi } = daYunByIndex.get(index);
    for (const char of ganZhi) {
      const element = stemBranchElements[char];
      const axis = period.radar.axes.find(a => a.label === element);
      const natalShare = (natal.counts[element] / natal.total) * 100;
      assert.ok(axis.value >= natalShare - 1e-9,
        `${period.label}「${element}」軸 ${axis.value} < 本命 ${natalShare}`);
    }
  }
});

test('紫微：四化加成使用該大限 mutagen（至少一步的加成分佈與生年四化不同）', () => {
  const { ziwei, evolution } = calculateFull();
  const ziweiPeriods = evolution.periods.filter(p => p.system === 'ziwei');

  // 生年四化的加成分佈（哪些宮拿到 100）
  const birthBonusByPalace = new Map();
  for (const palace of ziwei.components.filter(c => c.category === 'palaces')) {
    const stars = [...palace.value.majorStars, ...palace.value.minorStars, ...(palace.value.adjectiveStars ?? [])];
    birthBonusByPalace.set(palace.value.name, stars.some(s => s.mutagen) ? 100 : 0);
  }

  let anyDiffers = false;
  for (const period of ziweiPeriods) {
    const bonusPattern = period.radar.axes.map(a => a.inputs.fourTransformBonus);
    assert.ok(bonusPattern.some(b => b === 100), `${period.label} 無任何宮取得大限四化加成`);
    if (period.radar.axes.some(a => a.inputs.fourTransformBonus !== birthBonusByPalace.get(a.label))) {
      anyDiffers = true;
    }
  }
  assert.ok(anyDiffers, '全部大限的加成分佈都與生年四化相同，疑似未改用大限 mutagen');
});

test('narrative：非空一段且過 L1 lint；缺兩系統時 periods 空、narrative 空字串', () => {
  const { evolution } = calculateFull();
  assert.ok(evolution.narrative.length > 0);
  const { ok, problems } = HonestyGuard.lint(evolution.narrative, 'L1');
  assert.ok(ok, `L1 lint 違規：${problems.join('；')}`);

  const empty = EvolutionCalculator.calculate([], { asOf: AS_OF });
  assert.deepEqual(empty, { periods: [], narrative: '' });
});

test('asOf 只影響 isCurrent 類欄位：兩個 asOf 下 periods 的靜態欄位深比對相等（D-014）', () => {
  const run = (asOf) => {
    const bazi = new BaZiEngine({ asOf }).run(BIRTH);
    const ziwei = new ZiweiEngine({ asOf }).run(BIRTH);
    return EvolutionCalculator.calculate([bazi, ziwei], { asOf }).periods;
  };
  const a = run('2026-07-11');
  const b = run('2030-01-01');
  assert.deepEqual(a, b);
});
